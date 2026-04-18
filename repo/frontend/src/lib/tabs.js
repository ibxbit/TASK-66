export const tabs = [
  { id: 'search', label: 'Search/Browse' },
  { id: 'navigation', label: 'Guided Navigation' },
  { id: 'curator', label: 'Curator Admin' },
  { id: 'routes', label: 'Route Builder' },
  { id: 'programs', label: 'Programs' },
  { id: 'staffing', label: 'Staffing' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'exports', label: 'Exports' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'audit', label: 'Audit' }
];

export const PUBLIC_TABS = [];

export const roleAccess = {
  search: ['Administrator', 'Curator', 'Exhibit Manager', 'Program Coordinator', 'Employer', 'Reviewer', 'Auditor'],
  navigation: ['Administrator', 'Curator', 'Exhibit Manager', 'Program Coordinator', 'Employer', 'Reviewer', 'Auditor'],
  curator: ['Administrator', 'Curator'],
  routes: ['Administrator', 'Exhibit Manager'],
  programs: ['Administrator', 'Program Coordinator'],
  staffing: ['Administrator', 'Employer', 'Reviewer', 'Auditor'],
  analytics: ['Administrator', 'Curator', 'Program Coordinator', 'Auditor'],
  exports: ['Administrator', 'Auditor'],
  inbox: ['Administrator', 'Curator', 'Exhibit Manager', 'Program Coordinator', 'Employer', 'Reviewer', 'Auditor'],
  audit: ['Administrator', 'Auditor']
};

export const tabRequirementById = {
  search: {
    title: 'Catalog Search',
    description:
      'Search and browse the museum catalog. Requires CATALOG_READ permission.'
  },
  navigation: {
    title: 'Guided Navigation',
    description:
      'View exhibit routes and printable itineraries. Requires ROUTE_READ permission.'
  },
  curator: {
    title: 'Curator Administration',
    description:
      'Curator workflows are restricted to Curator and Administrator roles.'
  },
  routes: {
    title: 'Route Builder',
    description:
      'Route authoring requires venue management permissions.'
  },
  programs: {
    title: 'Program Scheduling',
    description:
      'Program scheduling and staffing allocations require Program Coordinator or Administrator role access.'
  },
  staffing: {
    title: 'Staffing Governance',
    description:
      'Staffing draft and approval lifecycle visibility is role-gated for Employer, Reviewer, or Administrator users.'
  },
  analytics: {
    title: 'Analytics',
    description:
      'Analytics dashboards require analytics read or manage permissions.'
  },
  exports: {
    title: 'Exports',
    description:
      'Secure exports are restricted to Auditor and Administrator roles.'
  },
  inbox: {
    title: 'Inbox',
    description:
      'Inbox access requires authenticated user context with inbox read permissions.'
  },
  audit: {
    title: 'Audit Events',
    description:
      'Audit events are restricted to Auditor and Administrator roles.'
  }
};

export const firstAllowedTab = (roles) => {
  const match = tabs.find((tab) => hasTabAccess(roles, tab.id));
  return match?.id || 'search';
};

export const hasTabAccess = (roles, tabId) => {
  if (PUBLIC_TABS.includes(tabId)) {
    return true;
  }
  return (roleAccess[tabId] || []).some((role) => roles.includes(role));
};

export const getTabRequirement = (tabId) =>
  tabRequirementById[tabId] || {
    title: 'Restricted Feature',
    description: 'You do not currently have permission to view this panel.'
  };
