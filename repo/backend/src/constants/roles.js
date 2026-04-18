const ROLES = Object.freeze([
  'Administrator',
  'Curator',
  'Exhibit Manager',
  'Program Coordinator',
  'Employer',
  'Reviewer',
  'Auditor'
]);

const PERMISSIONS = Object.freeze({
  USERS_ADMIN: ['Administrator'],
  CATALOG_CURATION: ['Administrator', 'Curator'],
  GRAPH_DRAFT_EDIT: ['Administrator', 'Curator'],
  GRAPH_PUBLISH: ['Administrator', 'Curator'],
  VENUE_MANAGE: ['Administrator', 'Exhibit Manager'],
  ROUTE_RULE_CHANGE: ['Administrator', 'Exhibit Manager'],
  ROUTE_READ: ['Administrator', 'Exhibit Manager', 'Curator', 'Program Coordinator', 'Employer', 'Reviewer', 'Auditor'],
  PROGRAM_MANAGE: ['Administrator', 'Program Coordinator'],
  JOB_EDIT: ['Administrator', 'Employer'],
  JOB_APPROVE: ['Administrator', 'Reviewer'],
  JOB_READ: ['Administrator', 'Employer', 'Reviewer', 'Auditor'],
  INBOX_READ: ['Administrator', 'Curator', 'Exhibit Manager', 'Program Coordinator', 'Employer', 'Reviewer', 'Auditor'],
  AUDIT_READ: ['Administrator', 'Auditor'],
  EXPORT_READ: ['Administrator', 'Auditor'],
  EXPORT_CREATE: ['Administrator', 'Auditor'],
  ANALYTICS_METRIC_MANAGE: ['Administrator'],
  ANALYTICS_DIMENSION_MANAGE: ['Administrator'],
  ANALYTICS_DASHBOARD_MANAGE: ['Administrator', 'Curator', 'Program Coordinator'],
  ANALYTICS_DASHBOARD_READ: ['Administrator', 'Curator', 'Program Coordinator', 'Auditor'],
  ANALYTICS_REPORT_MANAGE: ['Administrator'],
  ANALYTICS_REPORT_READ: ['Administrator', 'Auditor'],
  RECONCILIATION_READ: ['Administrator', 'Auditor'],
  CATALOG_READ: ['Administrator', 'Curator', 'Exhibit Manager', 'Program Coordinator', 'Employer', 'Reviewer', 'Auditor'],
  GRAPH_READ: ['Administrator', 'Curator', 'Exhibit Manager', 'Program Coordinator', 'Employer', 'Reviewer', 'Auditor']
});

module.exports = {
  ROLES,
  PERMISSIONS
};
