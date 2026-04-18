import ForbiddenState from './ForbiddenState';
import { getTabRequirement } from '../lib/tabs';

function FeatureGuard({ canAccess, tabId, children }) {
  if (canAccess) {
    return children;
  }

  const requirement = getTabRequirement(tabId);
  return <ForbiddenState title={requirement.title} description={requirement.description} />;
}

export default FeatureGuard;
