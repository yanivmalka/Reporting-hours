/**
 * בורר רמת הקיבוץ — מקום עבודה / + קורס / + קורס ויום (lib/courseGrouping.ts).
 * הגדרה אחת משותפת: שינוי כאן חל בכל המסכים (לוח הבקרה, יומן, דוח שכר, ייצוא).
 */
import { SegmentedControl } from './SegmentedControl';
import { GROUP_LEVEL_OPTIONS, setGroupLevel, useGroupLevel } from '../lib/courseGrouping';

export function GroupLevelPicker() {
  const level = useGroupLevel();
  return <SegmentedControl options={GROUP_LEVEL_OPTIONS} value={level} onChange={(l) => void setGroupLevel(l)} />;
}
