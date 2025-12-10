import AsyncStorage from '@react-native-async-storage/async-storage';

export async function fetchProjectControls(projectId) {
  let controlsArr = [];
  // Hämta utkast
  const draft = await AsyncStorage.getItem('draft_control');
  if (draft) {
    const parsed = JSON.parse(draft);
    if (parsed.project?.id === projectId) {
      controlsArr.push({ ...parsed, status: 'PÅGÅENDE' });
    }
  }
  // Hämta utförda kontroller
  const completed = await AsyncStorage.getItem('completed_controls');
  console.log('[FETCH] completed_controls:', completed);
  if (completed) {
    const parsedCompleted = JSON.parse(completed);
    parsedCompleted.forEach(ctrl => {
      if (ctrl.project?.id === projectId) {
        controlsArr.push(ctrl);
      }
    });
  }
  console.log('[FETCH] controlsArr for projectId', projectId, ':', JSON.stringify(controlsArr, null, 2));
  return controlsArr;
}
