import React from 'react';
import { View } from 'react-native';
import { FoldChevron } from '../Chevrons';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { Button } from '../Button';
import type { WorkplaceFormModel } from './useWorkplaceForm';
import { EDIT_GROUPS, GROUP_TITLES, GroupKey, NEW_STEPS } from './shared';
import { makeWorkplaceFormStyles as makeStyles } from './styles';

/**
 * סידור הקבוצות: ביצירה — וויזארד עם צעד לכל קבוצה; בעריכה — קבוצות מתקפלות
 * עם סיכום, ושמירה בתחתית.
 */
export function FormGroups({ w, sections }: { w: WorkplaceFormModel; sections: Record<GroupKey, React.ReactNode> }) {
  const { router, styles, isEdit, saving, wizStep, setWizStep, openGroups, toggleGroup, groupY, handleSave, wizNext, summaryOf } = w;
  if (!isEdit) {
    // יצירה: וויזארד — צעד לכל קבוצה.
    const key = NEW_STEPS[wizStep];
    return (
      <>
        <View style={styles.stepper}>
          {NEW_STEPS.map((k, i) => (
            <View key={k} style={styles.stepItem}>
              <View style={[styles.stepDot, i <= wizStep && styles.stepDotOn]}>
                <Text style={[styles.stepNum, i <= wizStep && styles.stepNumOn]}>{i < wizStep ? '✓' : i + 1}</Text>
              </View>
              <Text style={[styles.stepLabel, i === wizStep && styles.stepLabelOn]}>{GROUP_TITLES[k]}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.groupTitleBig}>{GROUP_TITLES[key]}</Text>
        {sections[key]}
        <View style={styles.actions}>
          {wizStep === NEW_STEPS.length - 1 ? (
            <Button label="הוספה" onPress={handleSave} loading={saving} />
          ) : (
            <Button label="המשך" onPress={wizNext} />
          )}
          {wizStep === 0 ? (
            <Button label="ביטול" variant="secondary" onPress={() => router.back()} />
          ) : (
            <Button label="חזרה" variant="secondary" onPress={() => setWizStep((n) => n - 1)} />
          )}
        </View>
      </>
    );
  }
  return (
    <>
      {EDIT_GROUPS.map((key) => {
        const open = openGroups.includes(key);
        return (
          <View
            key={key}
            style={styles.group}
            onLayout={(e) => {
              groupY.current[key] = e.nativeEvent.layout.y;
            }}
          >
            <Pressable
              onPress={() => toggleGroup(key)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              style={({ pressed }) => [styles.groupHead, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.groupTexts}>
                <Text style={styles.groupTitle}>{GROUP_TITLES[key]}</Text>
                {open ? null : (
                  <Text style={styles.groupSummary} numberOfLines={1}>
                    {summaryOf(key)}
                  </Text>
                )}
              </View>
              <FoldChevron open={open} />
            </Pressable>
            {open ? <View style={styles.groupBody}>{sections[key]}</View> : null}
          </View>
        );
      })}
      <Button label="שמירת שינויים" onPress={handleSave} loading={saving} />
    </>
  );
}
