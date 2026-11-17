import { RequireAccess } from '../components/Access';
import React from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { VacationsCard } from '../components/Vacations';
import { Screen } from '../components/Screen';
import { useWorkplaceForm, workplaceFormView, type WorkplaceFormModel } from '../components/workplaceForm/useWorkplaceForm';
import type { GroupKey } from '../components/workplaceForm/shared';
import { GeneralSection } from '../components/workplaceForm/GeneralSection';
import { PaySection } from '../components/workplaceForm/PaySection';
import { ArrivalSection } from '../components/workplaceForm/ArrivalSection';
import { PayrollSection } from '../components/workplaceForm/PayrollSection';
import { CancelSection } from '../components/workplaceForm/CancelSection';
import { CoursesSection } from '../components/workplaceForm/CoursesSection';
import { ManageSection } from '../components/workplaceForm/ManageSection';
import { FormGroups } from '../components/workplaceForm/FormGroups';

/**
 * מקום עבודה: יצירה (וויזארד) ועריכה (קבוצות מתקפלות). הלוגיקה ב־
 * components/workplaceForm/useWorkplaceForm.tsx, וכל קבוצה ברכיב משלה.
 */
function WorkplaceFormScreenInner() {
  const core = useWorkplaceForm();
  const { form, hydrated, title, styles, colors, id, scrollRef, confirm } = core;

  if (!form || !hydrated) {
    return (
      <Screen scroll={false}>
        <Stack.Screen options={{ title }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const w: WorkplaceFormModel = { ...core, ...workplaceFormView({ ...core, form }) };
  const sections: Record<GroupKey, React.ReactNode> = {
    general: <GeneralSection w={w} />,
    pay: <PaySection w={w} />,
    arrival: <ArrivalSection w={w} />,
    payroll: <PayrollSection w={w} />,
    cancel: <CancelSection w={w} />,
    vacations: id ? <VacationsCard target={{ kind: 'workplace', id }} editable bare /> : null,
    courses: <CoursesSection w={w} />,
    manage: <ManageSection w={w} />,
  };

  return (
    <Screen keyboardFooter scrollRef={scrollRef}>
      <Stack.Screen options={{ title }} />
      <FormGroups w={w} sections={sections} />
      {confirm.dialog}
    </Screen>
  );
}

/** מורשה בלי הרשאה מתאימה (docs/sharing-spec.md) רואה מסך "אין הרשאה". */
export default function WorkplaceFormScreen() {
  return (
    <RequireAccess need="edit">
      <WorkplaceFormScreenInner />
    </RequireAccess>
  );
}
