/**
 * Folder icon colors - 10 predefined colors for folder icons
 */
export const FOLDER_COLORS = [
  { id: 'blue', name: 'Blå', color: '#1976D2', icon: 'folder' },
  { id: 'green', name: 'Grön', color: '#43A047', icon: 'folder' },
  { id: 'orange', name: 'Orange', color: '#FB8C00', icon: 'folder' },
  { id: 'red', name: 'Röd', color: '#E53935', icon: 'folder' },
  { id: 'purple', name: 'Lila', color: '#7B1FA2', icon: 'folder' },
  { id: 'teal', name: 'Turkos', color: '#00897B', icon: 'folder' },
  { id: 'pink', name: 'Rosa', color: '#C2185B', icon: 'folder' },
  { id: 'brown', name: 'Brun', color: '#6D4C41', icon: 'folder' },
  { id: 'yellow', name: 'Gul', color: '#FBC02D', icon: 'folder' },
  { id: 'cyan', name: 'Cyan', color: '#00BCD4', icon: 'folder' },
];

export const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0]; // Blue

export function getFolderColor(colorId) {
  return FOLDER_COLORS.find(c => c.id === colorId) || DEFAULT_FOLDER_COLOR;
}
