# AI Enhancement Workflow Diagram

This document provides a visual representation of the AI-driven feature enhancement workflow in Modern Accounting.

## High-Level Workflow

```mermaid
flowchart TD
    subgraph User["User Interaction"]
        A[User submits enhancement request] --> B[Chat UI captures description]
    end

    subgraph API["Chat API Processing"]
        B --> C[POST /api/enhancements]
        C --> D[Claude parses user intent]
        D --> E[Enhancement stored in DB<br/>Status: pending]
    end

    subgraph Monitor["Monitor Agent"]
        F[Monitor Agent polls DB] --> G{Pending<br/>enhancement?}
        G -->|No| F
        G -->|Yes| H[Claim enhancement<br/>Status: processing]
    end

    subgraph Planning["AI Planning Phase"]
        H --> I[Claude generates<br/>implementation plan]
        I --> J[Plan stored in DB<br/>Status: planning]
    end

    subgraph Implementation["AI Implementation Phase"]
        J --> K[Create feature branch]
        K --> L[Claude generates code<br/>for each task]
        L --> M[Status: implementing]
        M --> N[Internal code review<br/>using Claude]
        N --> O[Status: reviewing]
    end

    subgraph GitHub["GitHub Integration"]
        O --> P[Commit and push changes]
        P --> Q[Create Pull Request]
        Q --> R[Request Copilot review]
        R --> S[Status: copilot_reviewing]
        S --> T{Copilot<br/>response?}
        T -->|Yes| U[Process review feedback]
        T -->|Timeout| V[Fallback to Claude review]
        U --> W[Status: pr_created]
        V --> W
    end

    subgraph Deployment["Deployment Phase"]
        W --> X[Admin schedules deployment]
        X --> Y[Deployment record created<br/>Status: pending]
        Y --> Z[Scheduler checks<br/>scheduled date]
        Z --> AA{Ready to<br/>deploy?}
        AA -->|No| Z
        AA -->|Yes| AB{CI checks<br/>passed?}
        AB -->|Yes| AC[Merge PR]
        AB -->|No| AD[Deployment failed]
        AC --> AE[Status: deployed]
        AD --> AF[Status: failed]
    end

    E --> F
    AE --> AG[Notification sent<br/>to requestor]
    AF --> AG

    style A fill:#e1f5fe
    style E fill:#fff3e0
    style W fill:#e8f5e9
    style AE fill:#c8e6c9
    style AF fill:#ffcdd2
```

## Detailed Status Flow

```mermaid
stateDiagram-v2
    [*] --> pending: User submits request
    pending --> processing: Agent claims task
    processing --> planning: Generate plan
    planning --> implementing: Start code generation
    implementing --> reviewing: Internal review
    reviewing --> copilot_reviewing: Push & create PR
    copilot_reviewing --> pr_created: Review complete
    pr_created --> completed: PR merged
    pr_created --> failed: Merge failed

    processing --> failed: Plan generation failed
    implementing --> failed: Code generation failed
    reviewing --> failed: Review rejected

    failed --> [*]
    completed --> [*]
```

## Component Interaction

```mermaid
sequenceDiagram
    participant User
    participant ChatUI as Chat UI (React)
    participant API as Chat API (Express)
    participant DB as Database (SQL Server)
    participant Agent as Monitor Agent
    participant Claude as Claude AI
    participant GitHub as GitHub API
    participant Copilot as GitHub Copilot

    User->>ChatUI: Submit enhancement request
    ChatUI->>API: POST /api/enhancements
    API->>Claude: Parse user intent
    Claude-->>API: Intent + metadata
    API->>DB: INSERT Enhancement (pending)
    API-->>ChatUI: Enhancement created
    ChatUI-->>User: Request submitted confirmation

    loop Every 5 minutes
        Agent->>DB: Query pending enhancements
    end

    DB-->>Agent: Return pending enhancement
    Agent->>DB: UPDATE status = processing

    Agent->>Claude: Generate implementation plan
    Claude-->>Agent: Plan JSON
    Agent->>DB: Store plan, status = planning

    Agent->>GitHub: Create feature branch
    GitHub-->>Agent: Branch created

    Agent->>Claude: Generate code for each task
    Claude-->>Agent: Generated code
    Agent->>DB: status = implementing

    Agent->>Claude: Review generated code
    Claude-->>Agent: Review feedback
    Agent->>DB: status = reviewing

    Agent->>GitHub: Commit and push changes
    Agent->>GitHub: Create pull request
    GitHub-->>Agent: PR number + URL
    Agent->>DB: Store PR info

    Agent->>GitHub: Post @github-copilot comment
    Agent->>DB: status = copilot_reviewing

    loop Poll for 10 minutes
        Agent->>GitHub: Check PR comments
    end

    alt Copilot responds
        GitHub-->>Agent: Copilot review comment
        Agent->>Claude: Process review feedback
    else Timeout
        Agent->>Claude: Fallback review
    end

    Agent->>DB: status = pr_created
    Agent-->>User: Notification: PR ready for review
```

## Deployment Scheduling

```mermaid
flowchart LR
    subgraph Admin["Admin Actions"]
        A[View approved PRs] --> B[Select deployment date]
        B --> C[Schedule deployment]
    end

    subgraph Scheduler["Deployment Scheduler"]
        D[Query pending deployments] --> E{Scheduled<br/>date reached?}
        E -->|No| D
        E -->|Yes| F{PR<br/>mergeable?}
        F -->|No| G[Mark as failed]
        F -->|Yes| H{CI checks<br/>passed?}
        H -->|No| G
        H -->|Yes| I[Squash merge PR]
        I --> J[Mark as deployed]
    end

    C --> D
    J --> K[Send notification]
    G --> K

    style I fill:#c8e6c9
    style G fill:#ffcdd2
```

## Error Handling and Recovery

```mermaid
flowchart TD
    A[Error occurs] --> B{Error type?}

    B -->|API Timeout| C[Retry with backoff]
    C --> D{Max retries?}
    D -->|No| E[Retry operation]
    D -->|Yes| F[Mark as failed]

    B -->|Claude Rate Limit| G[Wait and retry]
    G --> E

    B -->|GitHub Error| H[Log error details]
    H --> I{Recoverable?}
    I -->|Yes| E
    I -->|No| F

    B -->|Merge Conflict| J[Mark for manual resolution]
    J --> K[Notify admin]

    B -->|Code Review Failure| L[Store feedback]
    L --> M[Attempt auto-fix with Claude]
    M --> N{Fix successful?}
    N -->|Yes| O[Continue workflow]
    N -->|No| F

    F --> P[Update status to failed]
    P --> Q[Store error message in notes]
    Q --> R[Send failure notification]
```

## Database Entity Relationships

```mermaid
erDiagram
    Enhancements ||--o{ Deployments : has

    Enhancements {
        int Id PK
        nvarchar RequestorName
        nvarchar Description
        varchar Status
        datetime CreatedAt
        datetime UpdatedAt
        varchar BranchName
        int PrNumber
        nvarchar PrUrl
        nvarchar PlanJson
        nvarchar Notes
        nvarchar ErrorMessage
    }

    Deployments {
        int Id PK
        int EnhancementId FK
        datetime ScheduledDate
        varchar Status
        datetime DeployedAt
        nvarchar Notes
    }
```

## Related Documentation

- [AI Feature System Overview](./ai-feature-system.md)
- [API Reference](./api-reference.md)
- [Setup Guide](./ai-feature-setup.md)
