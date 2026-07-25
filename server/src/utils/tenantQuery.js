const { ROLES } = require("../models/User");

/**
 * Builds Elasticsearch 'must' query array enforcing strict tenant & project isolation.
 *
 * Enforces:
 * 1. `organizationId` derived directly from `req.organizationId` (frontend input ignored).
 * 2. Non-ADMIN users (DEVELOPER / VIEWER) are strictly restricted to `req.assignedProjects`.
 * 3. Optional `projectId` filter validation against authorized assignedProjects.
 *
 * @param {object} req - Express request object (populated with req.organizationId, req.userRole, req.assignedProjects)
 * @param {Array} [baseMust=[]] - Initial query filter terms
 * @returns {Array} Scoped query array for Elasticsearch bool.must
 */
function buildTenantLogQuery(req, baseMust = []) {
  const must = [...baseMust];

  const orgId = req.organizationId || (req.user?.organization
    ? (req.user.organization._id ? req.user.organization._id.toString() : req.user.organization.toString())
    : null);

  if (orgId) {
    must.push({
      bool: {
        should: [
          { term: { organizationId: orgId } },
          { term: { "organizationId.keyword": orgId } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  const role = req.userRole || req.user?.role;
  const assignedProjects = req.assignedProjects || (Array.isArray(req.user?.assignedProjects)
    ? req.user.assignedProjects.map((p) => (p._id ? p._id.toString() : p.toString()))
    : []);

  if (role !== ROLES.ADMIN) {
    if (assignedProjects.length === 0) {
      // User is not assigned to any project -> return empty result set
      must.push({ term: { projectId: "NO_ASSIGNED_PROJECTS" } });
    } else if (req.query?.projectId) {
      const requestedProjectId = String(req.query.projectId);
      if (assignedProjects.includes(requestedProjectId)) {
        must.push({
          bool: {
            should: [
              { term: { projectId: requestedProjectId } },
              { term: { "projectId.keyword": requestedProjectId } },
            ],
            minimum_should_match: 1,
          },
        });
      } else {
        must.push({ term: { projectId: "UNAUTHORIZED_PROJECT_REQUEST" } });
      }
    } else {
      must.push({
        terms: { projectId: assignedProjects },
      });
    }
  } else if (req.query?.projectId) {
    const requestedProjectId = String(req.query.projectId);
    must.push({
      bool: {
        should: [
          { term: { projectId: requestedProjectId } },
          { term: { "projectId.keyword": requestedProjectId } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  return must;
}

module.exports = { buildTenantLogQuery };
