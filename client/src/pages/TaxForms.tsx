import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Users, Building2, Calendar } from 'lucide-react';
import { getAvailableTaxYears } from '../lib/taxForms';

export default function TaxForms() {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear() - 1);
  const availableYears = getAvailableTaxYears();

  const taxFormTypes = [
    {
      name: 'W-2 Forms',
      description: 'Wage and Tax Statement for employees. Generate individual or batch W-2 forms.',
      href: `/tax-forms/w2?year=${selectedYear}`,
      icon: Users,
      color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      type: 'Employees',
    },
    {
      name: '1099-NEC Forms',
      description: 'Nonemployee Compensation for contractors. Generate 1099-NEC for vendors paid $600 or more.',
      href: `/tax-forms/1099-nec?year=${selectedYear}`,
      icon: Building2,
      color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
      type: 'Contractors',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Year-End Tax Forms</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Generate W-2 and 1099-NEC forms for tax reporting
        </p>
      </div>

      {/* Year Selector */}
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <label className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tax Year:</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Form Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {taxFormTypes.map((form) => (
          <Link
            key={form.name}
            to={form.href}
            className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${form.color}`}>
                <form.icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{form.name}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{form.description}</p>
                <span className="mt-3 inline-flex items-center text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  <FileText className="h-4 w-4 mr-1" />
                  {form.type}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Information Section */}
      <div className="mt-8 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">Important Deadlines</h3>
        <ul className="mt-2 text-sm text-amber-700 dark:text-amber-400 space-y-1">
          <li>- W-2 forms must be provided to employees by January 31st</li>
          <li>- 1099-NEC forms must be provided to recipients by January 31st</li>
          <li>- File Copy A with the IRS by January 31st (paper) or March 31st (electronic)</li>
        </ul>
      </div>

      {/* Quick Links */}
      <div className="mt-6 flex items-center justify-between text-sm">
        <Link
          to="/employees"
          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        >
          Manage Employees
        </Link>
        <Link
          to="/vendors"
          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        >
          Manage Vendors
        </Link>
      </div>
    </div>
  );
}
