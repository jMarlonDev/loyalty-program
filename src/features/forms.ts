export type ProgramForm = {
  name: string;
  description: string;
  stamps_required: number;
  reward_description: string;
  logo_url: string;
  background_color: string;
  text_color: string;
  card_message: string;
};
export function purchasePayload(
  card: string,
  location: string,
  reference: string,
) {
  return {
    card_id: card,
    location_id: location,
    sale_reference: reference.trim(),
  };
}
export function programPayload(form: ProgramForm, editing: boolean) {
  const { stamps_required, reward_description, ...design } = form;
  return {
    ...design,
    name: form.name.trim(),
    logo_url: form.logo_url.trim() || null,
    ...(editing
      ? {}
      : { stamps_required, reward_description: reward_description.trim() }),
  };
}
export function safeReturnTo(value: string | null | undefined) {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    ![...value].some((character) => character.charCodeAt(0) < 32)
    ? value
    : '/app';
}
export function contrastRatio(a: string, b: string) {
  const luminance = (color: string) => {
    const rgb = [1, 3, 5]
      .map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return (
      (rgb[0] ?? 0) * 0.2126 + (rgb[1] ?? 0) * 0.7152 + (rgb[2] ?? 0) * 0.0722
    );
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
