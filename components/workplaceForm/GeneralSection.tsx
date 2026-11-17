import { View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { FormField } from '../FormField';
import { TextField } from '../TextField';
import { contactsSupported } from '../../lib/contacts';
import { workplacePalette } from '../../theme/workplaceColors';
import type { WorkplaceFormModel } from './useWorkplaceForm';

/** קבוצת "כללי": שם, צבע, כתובת ואנשי קשר. */
export function GeneralSection({ w }: { w: WorkplaceFormModel }) {
  const { styles, colors, form, errors, set, addContact, updateContact, removeContact, importContact } = w;
  return (
    <>
          <>
          <FormField label="שם מקום העבודה" error={errors.name}>
            <TextField
              value={form.name}
              onChangeText={(t) => set('name', t)}
              placeholder="מכללה / אוניברסיטה"
              invalid={Boolean(errors.name)}
            />
          </FormField>

          <FormField label="צבע" hint="מסמן את מקום העבודה בלו״ז, בדיווחים ובלוח הבקרה. משתנה יחד עם צבע המערכת.">
            <View style={styles.swatches} accessibilityRole="radiogroup">
              {workplacePalette(colors).map((c, i) => {
                const on = form.colorIndex === i;
                return (
                  <Pressable
                    key={i}
                    onPress={() => set('colorIndex', i)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`צבע ${i + 1}`}
                    style={[styles.swatch, { backgroundColor: c }, on && { borderColor: colors.text }]}
                  >
                    {on ? <Text style={styles.swatchCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </FormField>

          <FormField label="אנשי קשר" hint="מזכירות, רכז/ת, מחלקת שכר — טלפון ו/או מייל">
            <View style={styles.contacts}>
              {form.contacts.map((c) => (
                <View key={c.id} style={styles.contactCard}>
                  <View style={styles.phoneRow}>
                    <View style={{ flex: 1 }}>
                      <TextField
                        value={c.description}
                        onChangeText={(t) => updateContact(c.id, { description: t })}
                        placeholder="תיאור (למשל מזכירות)"
                      />
                    </View>
                    <Pressable
                      onPress={() => removeContact(c.id)}
                      accessibilityRole="button"
                      accessibilityLabel="הסרת איש הקשר"
                      style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={styles.removeText}>✕</Text>
                    </Pressable>
                  </View>
                  <TextField
                    value={c.name}
                    onChangeText={(t) => updateContact(c.id, { name: t })}
                    placeholder="שם (רשות)"
                  />
                  <TextField
                    value={c.phone}
                    onChangeText={(t) => updateContact(c.id, { phone: t })}
                    phone
                    placeholder="טלפון"
                  />
                  <TextField
                    value={c.email}
                    onChangeText={(t) => updateContact(c.id, { email: t })}
                    email
                    placeholder="מייל"
                  />
                  {errors.contactErrors?.[c.id] ? (
                    <Text style={styles.contactError}>{errors.contactErrors[c.id]}</Text>
                  ) : null}
                </View>
              ))}
              <View style={styles.chipWrap}>
                <Pressable
                  onPress={() => addContact()}
                  style={({ pressed }) => [styles.termsChip, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                >
                  <Text style={styles.termsChipText}>+ הוספה ידנית</Text>
                </Pressable>
                {contactsSupported ? (
                  <Pressable
                    onPress={importContact}
                    style={({ pressed }) => [styles.termsChip, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.termsChipText}>+ מאנשי הקשר</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </FormField>
          </>
    </>
  );
}
