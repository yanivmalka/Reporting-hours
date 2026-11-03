/** האשפה עברה למסך "ארכיון ואשפה" — הנתיב הישן מפנה ללשונית האשפה. */
import { Redirect } from 'expo-router';

export default function TrashRedirect() {
  return <Redirect href={{ pathname: '/archive', params: { tab: 'trash' } }} />;
}
