/**
 * System checklist template – Anbud (Kalkylskede).
 * Non-deletable system categories and items; used to seed new projects.
 * Structure prepared for future stages: Produktion, Avslut, Eftermarknad.
 */

const CATEGORY_IDS = {
  forfragningsunderlag: 'cat-forfragningsunderlag',
  foretagsbeslut: 'cat-foretagsbeslut',
  tiderMoten: 'cat-tider-moten',
  inforAnbudslamning: 'cat-infor-anbudslamning',
  uppfoljning: 'cat-uppfoljning',
};

/** System template for stage kalkylskede (Anbud) */
export const CHECKLIST_SYSTEM_TEMPLATE_KALKYLSKEDE = {
  id: 'system-anbud',
  name: 'Anbudsprocess',
  stage: 'kalkylskede',
  isSystemTemplate: true,
  categories: [
    { id: CATEGORY_IDS.forfragningsunderlag, name: 'Förfrågningsunderlag', sortOrder: 1, isSystemCategory: true },
    { id: CATEGORY_IDS.foretagsbeslut, name: 'Företagsbeslut', sortOrder: 2, isSystemCategory: true },
    { id: CATEGORY_IDS.tiderMoten, name: 'Tider & Möten', sortOrder: 3, isSystemCategory: true },
    { id: CATEGORY_IDS.inforAnbudslamning, name: 'Inför Anbudslämning', sortOrder: 4, isSystemCategory: true },
    { id: CATEGORY_IDS.uppfoljning, name: 'Uppföljning', sortOrder: 5, isSystemCategory: true },
  ],
  items: [
    // Förfrågningsunderlag
    { id: 'item-ffu-1', categoryId: CATEGORY_IDS.forfragningsunderlag, title: 'Förfrågningsunderlag från beställaren uppladdat', isMandatory: true, defaultSortOrder: 1 },
    { id: 'item-ffu-2', categoryId: CATEGORY_IDS.forfragningsunderlag, title: 'Genomgång AF-del', isMandatory: true, defaultSortOrder: 2 },
    { id: 'item-ffu-3', categoryId: CATEGORY_IDS.forfragningsunderlag, title: 'Genomgång FFU', isMandatory: true, defaultSortOrder: 3 },
    { id: 'item-ffu-4', categoryId: CATEGORY_IDS.forfragningsunderlag, title: 'Genomgång tekniska beskrivningar', isMandatory: false, defaultSortOrder: 4 },
    { id: 'item-ffu-5', categoryId: CATEGORY_IDS.forfragningsunderlag, title: 'Genomgång KFU / FrågaSvar', isMandatory: false, defaultSortOrder: 5 },
    // Företagsbeslut
    { id: 'item-fb-1', categoryId: CATEGORY_IDS.foretagsbeslut, title: 'Kreditkontroll beställare', isMandatory: false, defaultSortOrder: 1 },
    { id: 'item-fb-2', categoryId: CATEGORY_IDS.foretagsbeslut, title: 'Styrelsekontroll', isMandatory: false, defaultSortOrder: 2 },
    // Tider & Möten
    { id: 'item-tm-1', categoryId: CATEGORY_IDS.tiderMoten, title: 'Platsbesök', isMandatory: false, defaultSortOrder: 1 },
    { id: 'item-tm-2', categoryId: CATEGORY_IDS.tiderMoten, title: 'Inköpsmöte', isMandatory: false, defaultSortOrder: 2 },
    { id: 'item-tm-3', categoryId: CATEGORY_IDS.tiderMoten, title: 'Offertgranskning', isMandatory: false, defaultSortOrder: 3 },
    // Inför Anbudslämning
    { id: 'item-an-1', categoryId: CATEGORY_IDS.inforAnbudslamning, title: 'Kalkylgranskning', isMandatory: true, defaultSortOrder: 1 },
    { id: 'item-an-2', categoryId: CATEGORY_IDS.inforAnbudslamning, title: 'Risk & möjligheter', isMandatory: true, defaultSortOrder: 2 },
    { id: 'item-an-3', categoryId: CATEGORY_IDS.inforAnbudslamning, title: 'Anbudsmöte', isMandatory: false, defaultSortOrder: 3 },
    { id: 'item-an-4', categoryId: CATEGORY_IDS.inforAnbudslamning, title: 'Anbudsinlämning', isMandatory: true, defaultSortOrder: 4 },
    // Uppföljning
    { id: 'item-up-1', categoryId: CATEGORY_IDS.uppfoljning, title: 'Erfarenhetsåterföring', isMandatory: false, defaultSortOrder: 1 },
    { id: 'item-up-2', categoryId: CATEGORY_IDS.uppfoljning, title: 'Tilldelningsbeslut', isMandatory: false, defaultSortOrder: 2 },
  ],
};

/** Get system template by stage (only kalkylskede has one for now) */
export function getSystemTemplateForStage(stage) {
  const key = String(stage || '').trim();
  if (key === 'kalkylskede') return CHECKLIST_SYSTEM_TEMPLATE_KALKYLSKEDE;
  return null;
}
