# OpsAssist – AI-Powered Helpdesk Management System developed by ByteBuilders

OpsAssist is an AI-powered internal helpdesk platform designed to streamline the way employees report issues and communicate with support teams. The system uses Artificial Intelligence to provide instant responses to common queries, automatically categorises and routes tickets to the correct department, and enables seamless collaboration between employees and administrators.

When AI cannot fully resolve an issue, tickets are escalated to the appropriate department where administrators can continue the conversation through an integrated messaging system until the issue is resolved.

---

## Features

### Employee Portal
- Secure user authentication
- Submit support tickets
- AI-generated responses for common issues
- View ticket history
- Real-time chat with support staff
- Email notifications
- Track ticket status
- Receive updates when tickets change status

### AI Support
- Instant responses to common queries
- Automatic ticket categorisation
- Department prediction
- Intelligent routing
- Escalation when AI cannot resolve an issue

### Administrator Portal
- Department-specific dashboard
- View and manage assigned tickets
- Respond to users through conversation/notes
- Automatic status updates
- Ticket approval workflows
- Analytics dashboard
- Notification centre

### Super Administrator
- Manage users
- Create and deactivate accounts
- Assign administrators to departments
- Manage departments
- Monitor system analytics
- View organisation-wide reports

---

## Departments

OpsAssist currently supports four departments:

- Human Resources (HR)
- Information Technology (IT)
- Finance
- Operations

Each department has dedicated administrators responsible for resolving tickets assigned to them.

---

## Ticket Workflow

```text
Employee
    │
    ▼
Submit Ticket
    │
    ▼
AI Analyses Issue
    │
    ├───────────────► AI Resolves Issue
    │                     │
    │                     ▼
    │                 Ticket Resolved
    │
    ▼
AI Cannot Resolve
    │
    ▼
Route to Department
    │
    ▼
Department Administrator
    │
    ▼
Conversation Begins
    │
    ▼
Status Automatically Changes
Open → In Progress
    │
    ▼
Issue Resolved
    │
    ▼
Status → Resolved
```

---

## Ticket Statuses

| Status | Description |
|---------|-------------|
| Open | Ticket has been submitted and is awaiting action. |
| In Progress | Automatically triggered when an administrator or user replies in the conversation. |
| Resolved | The issue has been successfully resolved. |

---

## Email Notifications

OpsAssist automatically sends email notifications during important events.

Notifications include:

- Account activation email
- Ticket submitted confirmation
- New ticket assigned to department administrators
- Ticket status changed to **In Progress**
- Ticket resolved
- Approval requests
- Important conversation replies (using a cooldown mechanism to prevent excessive emails)

---

## User Roles

### Employee

- Submit tickets
- View ticket history
- Chat with administrators
- Track ticket progress

### Department Administrator

- Manage assigned department tickets
- Reply to users
- Update ticket information
- Request approvals
- View department analytics

### Super Administrator

- Manage all users
- Create administrators
- Assign departments
- Manage system configuration
- Monitor analytics
- Access organisation-wide reports

---

## Technology Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- Supabase
- PostgreSQL
- Edge Functions

### Artificial Intelligence

- AI-powered ticket classification
- Automated responses
- Smart routing

### Authentication

- Supabase Authentication

### Database

- PostgreSQL

### Email Service

- SMTP Email Service
- Automated email notifications

## Admin access

The Admin Dashboard is protected by a default password:

```
Password: OpsAdmin@2026
```

Open `/admin` and sign in to view, filter, and search all submitted tickets.

- **Frontend**: React + TanStack Start, Tailwind CSS, shadcn/ui components. Two surfaces: `/` (user submission) and `/admin` (password-gated dashboard).
- **Backend**: TanStack server functions (`createServerFn`) handle ticket submission and listing. No separate API server needed.
- 
- **Database**: Lovable Cloud (PostgreSQL) with a `tickets` table — `user_name`, `title`, `details`, `category`, `priority`, `created_at`.
- 
- **AI Classification Flow**: On submit, the server function sends the ticket title + details to Lovable AI (`google/gemini-2.5-flash`) with a strict JSON system prompt that returns `{ category, priority }`. If the AI is unavailable, a keyword-based heuristic (e.g. "urgent" → High, "vpn/laptop" → IT) provides a graceful fallback.
- **Priority Logic**: AI weighs urgency words ("urgent", "down", "asap", "blocker" → High; "whenever", "minor" → Low) and overall tone of the description.
- 
- **Admin Authentication**: A simple client-side password check (default `OpsAdmin@2026`) gates the dashboard via `sessionStorage`. Suitable for demo/presentation; for production replace with full auth.

## Stack

React • Tailwind CSS • TanStack Start • Lovable Cloud • Lovable AI Gateway
---

## Project Structure

```
OpsAssist/
│
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── services/
│   ├── lib/
│   ├── contexts/
│   └── utils/
│
├── public/
│
├── supabase/
│   ├── migrations/
│   └── functions/
│
├── package.json
└── README.md
```

---

## Installation

### Prerequisites

- Node.js (v18 or later)
- npm
- Supabase Project

---

### Clone the Repository

```bash
git clone https://github.com/your-username/opsassist.git
```

---

### Navigate to the Project

```bash
cd opsassist
```

---

### Install Dependencies

```bash
npm install
```

---

### Configure Environment Variables

Create a `.env` file in the project root.

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

If using server-side email services, include the required SMTP configuration.

---

### Start Development Server

```bash
npm run dev
```

The application will run at:

```
http://localhost:5173
```

---

## Building for Production

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

---

## System Highlights

- AI-powered support assistant
- Intelligent ticket routing
- Department-based management
- Automated email notifications
- Real-time communication
- Approval workflows
- Analytics dashboard
- Secure authentication
- Responsive design
- Centralised administration

---

## Future Improvements

- Microsoft Teams integration
- Slack integration
- Mobile application
- Voice-assisted ticket submission
- Predictive workload forecasting
- Knowledge base recommendations
- Multi-language support
- SLA monitoring
- Advanced reporting

---

## Contributors

This project was developed as part of the **CAPACITI YES Programme** by a team of five members:
- Lukholo Mabuto
- Asisipho Mbobo
- Minenhle Sibiya
- Mufhumudzi Moshapo
- Fanelesibonge Hlebani

---

## License

This project is developed for educational and demonstration purposes.

---

## Acknowledgements

Special thanks to:

- CAPACITI
- YES Programme
- Supabase
- React Community
- Vite
- Tailwind CSS

for providing the tools and technologies that made this project possible.
