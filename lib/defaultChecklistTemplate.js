/**
 * Standardchecklista för Kalkylskede (anbudsprocess).
 * ALLA projekt får denna mall som grund – vid projektcreation eller första öppning av checklistan.
 *
 * Används vid:
 * - Projektcreation (CreateProjectModal) – seed direkt
 * - Första öppning av Checklista med tom lista – auto-seed
 *
 * Mallen innehåller:
 * - Förfrågningsunderlag: FFU uppladdat och komplett, Genomgång AF-del, Genomgång FFU, Genomgång tekniska beskrivningar, Genomgång KFU / FrågaSvar
 * - Företagsbeslut: Kreditkontroll beställare, Styrelsekontroll
 * - Tider & Möten: Platsbesök, Inköpsmöte, Offertgranskning
 * - Inför Anbudslämning: Kalkylgranskning, Risk & möjligheter, Anbudsmöte, Anbudsinlämning
 * - Uppföljning: Erfarenhetsåterföring, Tilldelningsbeslut
 *
 * Status: 'pending' | 'in_progress' | 'done' | 'not_applicable'
 * "Redo för anbud" = alla required är 'done' eller 'not_applicable'.
 */

export const DEFAULT_CHECKLIST_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  NOT_APPLICABLE: 'not_applicable',
};

/** Standardmall – kategorier och punkter. Alla punkter required: true. */
export const defaultChecklistTemplate = {
  stage: 'kalkylskede',
  name: 'Anbudsprocess',
  categories: [
    {
      id: 'forfragningsunderlag',
      name: 'Förfrågningsunderlag',
      sortOrder: 1,
      items: [
        { id: 'ffu-1', title: 'FFU uppladdat och komplett', required: true, defaultSortOrder: 1 },
        { id: 'ffu-2', title: 'Genomgång AF-del', required: true, defaultSortOrder: 2 },
        { id: 'ffu-3', title: 'Genomgång FFU', required: true, defaultSortOrder: 3 },
        { id: 'ffu-4', title: 'Genomgång tekniska beskrivningar', required: true, defaultSortOrder: 4 },
        { id: 'ffu-5', title: 'Genomgång KFU / FrågaSvar', required: true, defaultSortOrder: 5 },
      ],
    },
    {
      id: 'foretagsbeslut',
      name: 'Företagsbeslut',
      sortOrder: 2,
      items: [
        { id: 'fb-1', title: 'Kreditkontroll beställare', required: true, defaultSortOrder: 1 },
        { id: 'fb-2', title: 'Styrelsekontroll', required: true, defaultSortOrder: 2 },
      ],
    },
    {
      id: 'tider-moten',
      name: 'Tider & Möten',
      sortOrder: 3,
      items: [
        { id: 'tm-1', title: 'Platsbesök', required: true, defaultSortOrder: 1 },
        { id: 'tm-2', title: 'Inköpsmöte', required: true, defaultSortOrder: 2 },
        { id: 'tm-3', title: 'Offertgranskning', required: true, defaultSortOrder: 3 },
      ],
    },
    {
      id: 'infor-anbudslamning',
      name: 'Inför Anbudslämning',
      sortOrder: 4,
      items: [
        { id: 'ia-1', title: 'Kalkylgranskning', required: true, defaultSortOrder: 1 },
        { id: 'ia-2', title: 'Risk & möjligheter', required: true, defaultSortOrder: 2 },
        { id: 'ia-3', title: 'Anbudsmöte', required: true, defaultSortOrder: 3 },
        { id: 'ia-4', title: 'Anbudsinlämning', required: true, defaultSortOrder: 4 },
      ],
    },
    {
      id: 'uppfoljning',
      name: 'Uppföljning',
      sortOrder: 5,
      items: [
        { id: 'up-1', title: 'Erfarenhetsåterföring', required: true, defaultSortOrder: 1 },
        { id: 'up-2', title: 'Tilldelningsbeslut', required: true, defaultSortOrder: 2 },
      ],
    },
  ],
};

/**
 * Beräkna progress för obligatoriska punkter.
 * Avklarad = status 'done' eller 'not_applicable'.
 * @param {Array<{ required?: boolean, status?: string }>} items
 * @returns {{ totalRequired: number, completedRequired: number, progressPercent: number, isReadyForAnbud: boolean }}
 */
export function computeChecklistProgress(items) {
  const list = Array.isArray(items) ? items : [];
  const required = list.filter((i) => i.required !== false && (i.isMandatory !== false || i.required === true));
  const completed = required.filter(
    (i) => {
      const s = (i.status || '').toString();
      return s === 'done' || s === 'Done' || s === 'not_applicable' || s === 'NotRelevant';
    }
  );
  const totalRequired = required.length;
  const completedRequired = completed.length;
  const progressPercent = totalRequired === 0 ? 100 : Math.round((completedRequired / totalRequired) * 100);
  const isReadyForAnbud = totalRequired === 0 || completedRequired === totalRequired;
  return { totalRequired, completedRequired, progressPercent, isReadyForAnbud };
}
