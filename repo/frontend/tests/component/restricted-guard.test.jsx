import { render, screen } from '@testing-library/react';
import FeatureGuard from '../../src/components/FeatureGuard';

describe('FeatureGuard', () => {
  it('renders forbidden state when user lacks access', () => {
    render(
      <FeatureGuard canAccess={false} tabId="curator">
        <div>Restricted Content</div>
      </FeatureGuard>
    );

    expect(screen.getByText('Curator Administration')).toBeTruthy();
    expect(screen.getByText(/Forbidden: insufficient permission/i)).toBeTruthy();
    expect(screen.queryByText('Restricted Content')).toBeNull();
  });

  it('renders content when access is granted', () => {
    render(
      <FeatureGuard canAccess tabId="curator">
        <div>Restricted Content</div>
      </FeatureGuard>
    );
    expect(screen.getByText('Restricted Content')).toBeTruthy();
  });

  it('blocks access to routes tab with correct requirement text', () => {
    render(
      <FeatureGuard canAccess={false} tabId="routes">
        <div>Route Builder Content</div>
      </FeatureGuard>
    );
    expect(screen.getByText('Route Builder')).toBeTruthy();
    expect(screen.getByText(/Forbidden: insufficient permission/i)).toBeTruthy();
    expect(screen.queryByText('Route Builder Content')).toBeNull();
  });

  it('blocks access to programs tab with correct requirement text', () => {
    render(
      <FeatureGuard canAccess={false} tabId="programs">
        <div>Programs Content</div>
      </FeatureGuard>
    );
    expect(screen.getByText('Program Scheduling')).toBeTruthy();
    expect(screen.getByText(/Forbidden: insufficient permission/i)).toBeTruthy();
    expect(screen.queryByText('Programs Content')).toBeNull();
  });

  it('blocks access to staffing tab with correct requirement text', () => {
    render(
      <FeatureGuard canAccess={false} tabId="staffing">
        <div>Staffing Content</div>
      </FeatureGuard>
    );
    expect(screen.getByText('Staffing Governance')).toBeTruthy();
    expect(screen.getByText(/Forbidden: insufficient permission/i)).toBeTruthy();
    expect(screen.queryByText('Staffing Content')).toBeNull();
  });

  it('blocks access to exports tab with correct requirement text', () => {
    render(
      <FeatureGuard canAccess={false} tabId="exports">
        <div>Exports Content</div>
      </FeatureGuard>
    );
    expect(screen.getByText('Exports')).toBeTruthy();
    expect(screen.getByText(/Forbidden: insufficient permission/i)).toBeTruthy();
    expect(screen.queryByText('Exports Content')).toBeNull();
  });

  it('blocks access to audit tab with correct requirement text', () => {
    render(
      <FeatureGuard canAccess={false} tabId="audit">
        <div>Audit Content</div>
      </FeatureGuard>
    );
    expect(screen.getByText('Audit Events')).toBeTruthy();
    expect(screen.getByText(/Forbidden: insufficient permission/i)).toBeTruthy();
    expect(screen.queryByText('Audit Content')).toBeNull();
  });

  it('blocks access to analytics tab with correct requirement text', () => {
    render(
      <FeatureGuard canAccess={false} tabId="analytics">
        <div>Analytics Content</div>
      </FeatureGuard>
    );
    expect(screen.getByText('Analytics')).toBeTruthy();
    expect(screen.getByText(/Forbidden: insufficient permission/i)).toBeTruthy();
    expect(screen.queryByText('Analytics Content')).toBeNull();
  });

  it('shows generic restricted message for unknown tab', () => {
    render(
      <FeatureGuard canAccess={false} tabId="nonexistent">
        <div>Unknown Content</div>
      </FeatureGuard>
    );
    expect(screen.getByText('Restricted Feature')).toBeTruthy();
    expect(screen.getByText(/Forbidden: insufficient permission/i)).toBeTruthy();
    expect(screen.queryByText('Unknown Content')).toBeNull();
  });
});
