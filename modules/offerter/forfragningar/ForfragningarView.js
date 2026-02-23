import InkopsplanView from '../inkopsplan/InkopsplanView';

/**
 * Inköp & Offerter (2026): inköpsplan-tabell genererad från register.
 * SharePoint används endast i backend för mappskapande.
 */
export default function ForfragningarView({ companyId, projectId }) {
	return <InkopsplanView companyId={companyId} projectId={projectId} />;
}
