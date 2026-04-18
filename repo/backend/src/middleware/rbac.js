const { PERMISSIONS } = require('../constants/roles');
const { sendError } = require('../lib/http');

const requirePermission = (permissionName) => {
  const allowedRoles = PERMISSIONS[permissionName] || [];

  return (req, res, next) => {
    const roles = req.auth?.roles || [];
    const allowed = roles.some((role) => allowedRoles.includes(role));

    if (!allowed) {
      return sendError(res, req, 403, 'FORBIDDEN', 'Insufficient role permissions');
    }

    return next();
  };
};

module.exports = {
  requirePermission
};
