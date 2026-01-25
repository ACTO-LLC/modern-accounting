import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Breadcrumb from './Breadcrumb';
import EntityCard from './EntityCard';
import CardGrid from './CardGrid';
import {
  BreadcrumbItem,
  EntityType,
  EntityCardData,
  CardState,
} from './types';

interface HierarchyViewProps {
  rootEntityType: 'vendor' | 'customer';
  rootEntity: {
    id: string;
    name: string;
  };
  levels: HierarchyLevel[];
  onLevelChange?: (level: number, selectedIds: string[]) => void;
}

export interface HierarchyLevel {
  entityType: EntityType;
  items: EntityCardData[];
  loading?: boolean;
  emptyMessage?: string;
}

export default function HierarchyView({
  rootEntityType,
  rootEntity,
  levels,
  onLevelChange,
}: HierarchyViewProps) {
  const navigate = useNavigate();
  const [currentLevel, setCurrentLevel] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Record<number, Set<string>>>({});
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    {
      id: rootEntity.id,
      label: rootEntity.name,
      entityType: rootEntityType,
    },
  ]);

  const getCardState = useCallback(
    (level: number, itemId: string): CardState => {
      const item = levels[level]?.items.find(i => i.id === itemId);
      if (item?.isDisabled) {
        return 'disabled';
      }
      const levelSelections = selectedIds[level];
      if (levelSelections?.has(itemId)) {
        return 'selected';
      }
      return 'default';
    },
    [selectedIds, levels]
  );

  const handleCardClick = useCallback(
    (level: number, item: EntityCardData) => {
      if (item.isDisabled) return;

      // Add to breadcrumb and navigate to next level
      const newBreadcrumbs = [
        ...breadcrumbs.slice(0, level + 1),
        {
          id: item.id,
          label: item.title,
          entityType: item.entityType,
        },
      ];
      setBreadcrumbs(newBreadcrumbs);

      // Move to next level
      const nextLevel = level + 1;
      if (nextLevel < levels.length) {
        setCurrentLevel(nextLevel);
        onLevelChange?.(nextLevel, [item.id]);
      }
    },
    [breadcrumbs, levels.length, onLevelChange]
  );

  const handleCardSelect = useCallback(
    (level: number, itemId: string) => {
      setSelectedIds((prev) => {
        const levelSelections = new Set(prev[level] || []);
        if (levelSelections.has(itemId)) {
          levelSelections.delete(itemId);
        } else {
          levelSelections.add(itemId);
        }
        return {
          ...prev,
          [level]: levelSelections,
        };
      });
    },
    []
  );

  const handleBreadcrumbNavigate = useCallback(
    (index: number) => {
      if (index === -1) {
        // Navigate back to list page
        navigate(rootEntityType === 'vendor' ? '/vendors' : '/customers');
        return;
      }

      // Navigate to specific level
      setCurrentLevel(index);
      setBreadcrumbs((prev) => prev.slice(0, index + 1));

      // Get the parent item ID for the level we're navigating to
      if (index > 0) {
        const parentId = breadcrumbs[index]?.id;
        if (parentId) {
          onLevelChange?.(index, [parentId]);
        }
      } else {
        onLevelChange?.(0, [rootEntity.id]);
      }
    },
    [navigate, rootEntityType, breadcrumbs, rootEntity.id, onLevelChange]
  );

  const handleBack = useCallback(() => {
    if (currentLevel > 0) {
      handleBreadcrumbNavigate(currentLevel - 1);
    } else {
      navigate(rootEntityType === 'vendor' ? '/vendors' : '/customers');
    }
  }, [currentLevel, handleBreadcrumbNavigate, navigate, rootEntityType]);

  const currentLevelData = levels[currentLevel];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={handleBack}
          className="inline-flex items-center text-sm text-gray-500 hover:text-indigo-600 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>

        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          {rootEntityType === 'vendor' ? 'Vendor' : 'Customer'} Drill-Down
        </h1>
        <p className="text-sm text-gray-500">
          Explore related documents and line items for {rootEntity.name}
        </p>
      </div>

      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbs} onNavigate={handleBreadcrumbNavigate} />

      {/* Current Level Cards */}
      <div className="mb-8">
        {currentLevelData && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-800">
                {getLevelTitle(currentLevelData.entityType)}
              </h2>
              {currentLevelData.items.length > 0 && (
                <span className="text-sm text-gray-500">
                  {currentLevelData.items.length} item
                  {currentLevelData.items.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <CardGrid
              loading={currentLevelData.loading}
              empty={!currentLevelData.loading && currentLevelData.items.length === 0}
              emptyMessage={currentLevelData.emptyMessage || 'No items found'}
            >
              {currentLevelData.items.map((item) => (
                <EntityCard
                  key={item.id}
                  data={item}
                  state={getCardState(currentLevel, item.id)}
                  onClick={() => handleCardClick(currentLevel, item)}
                  onSelect={() => handleCardSelect(currentLevel, item.id)}
                  isSelectable={false}
                  showDrillIcon={currentLevel < levels.length - 1}
                />
              ))}
            </CardGrid>
          </>
        )}
      </div>
    </div>
  );
}

function getLevelTitle(entityType: EntityType): string {
  const titles: Record<EntityType, string> = {
    vendor: 'Vendor',
    customer: 'Customer',
    purchaseorder: 'Purchase Orders',
    bill: 'Bills',
    invoice: 'Invoices',
    estimate: 'Estimates',
    purchaseorderline: 'Purchase Order Line Items',
    billline: 'Bill Line Items',
    invoiceline: 'Invoice Line Items',
    estimateline: 'Estimate Line Items',
  };
  return titles[entityType] || entityType;
}
