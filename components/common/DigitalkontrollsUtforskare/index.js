/**
 * Digitalkontrolls Utforskare – Återanvändbar filutforskare för olika sektioner.
 * Används i FFU, AF, Bilder, Kalkyl, Myndigheter m.fl. med olika rootPath.
 * Varje sektion får isolerade filer via sitt eget rootPath.
 */

import SharePointFolderFileArea from '@components/common/SharePointFiles/SharePointFolderFileArea';

export default function DigitalkontrollsUtforskare(props) {
  return <SharePointFolderFileArea {...props} />;
}
