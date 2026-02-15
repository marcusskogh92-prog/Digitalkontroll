/**
 * System checklist template for Anbud (Kalkylskede).
 * Single source of truth for default categories and items.
 * Reusable pattern for future stages: Produktion, Avslut, Eftermarknad.
 */

export const CHECKLIST_STAGE_KALKYLSKEDE = 'kalkylskede';

/** System template: Anbud (Kalkylskede) */
export const CHECKLIST_SYSTEM_TEMPLATE_ANBUD = {
  id: 'system-anbud',
  name: 'Anbud',
  stage: CHECKLIST_STAGE_KALKYLSKEDE,
  isSystemTemplate: true,
  categories: [
    {
      id: 'forfragningsunderlag',
      name: 'Förfrågningsunderlag',
      sortOrder: 1,
      isSystemCategory: true,
      items: [
        { id: 'ffu-1', title: 'Förfrågningsunderlag från beställaren uppladdat', description: '', isMandatory: true, defaultSortOrder: 1 },
        { id: 'ffu-2', title: 'Genomgång AF-del', description: '', isMandatory: true, defaultSortOrder: 2 },
        { id: 'ffu-3', title: 'Genomgång FFU', description: '', isMandatory: true, defaultSortOrder: 3 },
        { id: 'ffu-4', title: 'Genomgång tekniska beskrivningar', description: '', isMandatory: false, defaultSortOrder: 4 },
        { id: 'ffu-5', title: 'Genomgång KFU / FrågaSvar', description: '', isMandatory: false, defaultSortOrder: 5 },
      ],
    },
    {
      id: 'foretagsbeslut',
      name: 'Företagsbeslut',
      sortOrder: 2,
      isSystemCategory: true,
      items: [
        { id: 'fb-1', title: 'Kreditkontroll beställare', description: '', isMandatory: false, defaultSortOrder: 1 },
        { id: 'fb-2', title: 'Styrelsekontroll', description: '', isMandatory: false, defaultSortOrder: 2 },
      ],
    },
    {
      id: 'tider-moten',
      name: 'Tider & Möten',
      sortOrder: 3,
      isSystemCategory: true,
      items: [
        { id: 'tm-1', title: 'Platsbesök', description: '', isMandatory: false, defaultSortOrder: 1 },
        { id: 'tm-2', title: 'Inköpsmöte', description: '', isMandatory: false, defaultSortOrder: 2 },
        { id: 'tm-3', title: 'Offertgranskning', description: '', isMandatory: false, defaultSortOrder: 3 },
      ],
    },
    {
      id: 'infor-anbudslamning',
      name: 'Inför Anbudslämning',
      sortOrder: 4,
      isSystemCategory: true,
      items: [
        { id: 'ia-1', title: 'Kalkylgranskning', description: '', isMandatory: true, defaultSortOrder: 1 },
        { id: 'ia-2', title: 'Risk & möjligheter', description: '', isMandatory: true, defaultSortOrder: 2 },
        { id: 'ia-3', title: 'Anbudsmöte', description: '', isMandatory: false, defaultSortOrder: 3 },
        { id: 'ia-4', title: 'Anbudsinlämning', description: '', isMandatory: true, defaultSortOrder: 4 },
      ],
    },
    {
      id: 'uppfoljning',
      name: 'Uppföljning',
      sortOrder: 5,
      isSystemCategory: true,
      items: [
        { id: 'up-1', title: 'Erfarenhetsåterföring', description: '', isMandatory: false, defaultSortOrder: 1 },
        { id: 'up-2', title: 'Tilldelningsbeslut', description: '', isMandatory: false, defaultSortOrder: 2 },
      ],
    },
  ],
};

export const CHECKLIST_STATUS = {
  NOT_STARTED: 'NotStarted',
  IN_PROGRESS: 'InProgress',
  DONE: 'Done',
  NOT_RELEVANT: 'NotRelevant',
};

export const CHECKLIST_STATUS_LABELS = {
  NotStarted: 'Ej påbörjad',
  InProgress: 'Pågår',
  Done: 'Klar',
  NotRelevant: 'Ej aktuell',
};
