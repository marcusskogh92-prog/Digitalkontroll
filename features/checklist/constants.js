/**
 * Checklist – constants and system template for stage-based checklists.
 * Reusable for Kalkyl (Anbud), Produktion, Avslut, Eftermarknad.
 */

/** Item status (project checklist item) */
export const CHECKLIST_STATUS = {
  NotStarted: 'NotStarted',
  InProgress: 'InProgress',
  Done: 'Done',
  NotRelevant: 'NotRelevant',
};

export const CHECKLIST_STATUS_LABELS = {
  NotStarted: 'Ej påbörjad',
  InProgress: 'Pågår',
  Done: 'Klar',
  NotRelevant: 'Ej aktuell',
};

/** System template for Kalkylskede (Anbudsprocess). Categories and items are non-deletable; can be hidden per project. */
export const CHECKLIST_SYSTEM_TEMPLATE_KALKYLSKEDE = {
  stage: 'kalkylskede',
  name: 'Anbudsprocess',
  isSystemTemplate: true,
  categories: [
    {
      id: 'forfragningsunderlag',
      name: 'Förfrågningsunderlag',
      sortOrder: 1,
      isSystemCategory: true,
      items: [
        { id: 'ffu-1', title: 'Förfrågningsunderlag från beställaren uppladdat (obligatorisk)', isMandatory: true, defaultSortOrder: 1 },
        { id: 'ffu-2', title: 'Genomgång AF-del (obligatorisk)', isMandatory: true, defaultSortOrder: 2 },
        { id: 'ffu-3', title: 'Genomgång FFU (obligatorisk)', isMandatory: true, defaultSortOrder: 3 },
        { id: 'ffu-4', title: 'Genomgång tekniska beskrivningar', isMandatory: false, defaultSortOrder: 4 },
        { id: 'ffu-5', title: 'Genomgång KFU / FrågaSvar', isMandatory: false, defaultSortOrder: 5 },
      ],
    },
    {
      id: 'foretagsbeslut',
      name: 'Företagsbeslut',
      sortOrder: 2,
      isSystemCategory: true,
      items: [
        { id: 'fb-1', title: 'Kreditkontroll beställare', isMandatory: false, defaultSortOrder: 1 },
        { id: 'fb-2', title: 'Styrelsekontroll', isMandatory: false, defaultSortOrder: 2 },
      ],
    },
    {
      id: 'tider-moten',
      name: 'Tider & Möten',
      sortOrder: 3,
      isSystemCategory: true,
      items: [
        { id: 'tm-1', title: 'Platsbesök', isMandatory: false, defaultSortOrder: 1 },
        { id: 'tm-2', title: 'Inköpsmöte', isMandatory: false, defaultSortOrder: 2 },
        { id: 'tm-3', title: 'Offertgranskning', isMandatory: false, defaultSortOrder: 3 },
      ],
    },
    {
      id: 'infor-anbudslamning',
      name: 'Inför Anbudslämning',
      sortOrder: 4,
      isSystemCategory: true,
      items: [
        { id: 'ia-1', title: 'Kalkylgranskning (obligatorisk)', isMandatory: true, defaultSortOrder: 1 },
        { id: 'ia-2', title: 'Risk & möjligheter (obligatorisk)', isMandatory: true, defaultSortOrder: 2 },
        { id: 'ia-3', title: 'Anbudsmöte', isMandatory: false, defaultSortOrder: 3 },
        { id: 'ia-4', title: 'Anbudsinlämning (obligatorisk)', isMandatory: true, defaultSortOrder: 4 },
      ],
    },
    {
      id: 'uppfoljning',
      name: 'Uppföljning',
      sortOrder: 5,
      isSystemCategory: true,
      items: [
        { id: 'up-1', title: 'Erfarenhetsåterföring', isMandatory: false, defaultSortOrder: 1 },
        { id: 'up-2', title: 'Tilldelningsbeslut', isMandatory: false, defaultSortOrder: 2 },
      ],
    },
  ],
};

/** Get system template by stage */
export function getSystemTemplateForStage(stage) {
  const k = String(stage || '').toLowerCase();
  if (k === 'kalkylskede' || k === 'kalkyl') return CHECKLIST_SYSTEM_TEMPLATE_KALKYLSKEDE;
  return null;
}
