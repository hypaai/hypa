export interface VoiceEnrollmentBilling {
  operation: 'voice_enrollment';
  unit: 'enrollment';
  quantity: 1;
  unitPriceUsd: string;
  costUsd: string;
  voiceId: string;
}

export function getVoiceEnrollmentBilling(
  data: unknown,
): VoiceEnrollmentBilling | undefined {
  if (!data || typeof data !== 'object' || !('billing' in data))
    return undefined;
  const billing = data.billing;
  if (!billing || typeof billing !== 'object') return undefined;
  const b = billing as Record<string, unknown>;
  if (
    b.operation !== 'voice_enrollment' ||
    b.unit !== 'enrollment' ||
    b.quantity !== 1 ||
    typeof b.unitPriceUsd !== 'string' ||
    !b.unitPriceUsd.trim() ||
    !Number.isFinite(Number(b.unitPriceUsd)) ||
    Number(b.unitPriceUsd) < 0 ||
    typeof b.costUsd !== 'string' ||
    !b.costUsd.trim() ||
    !Number.isFinite(Number(b.costUsd)) ||
    Number(b.costUsd) < 0 ||
    typeof b.voiceId !== 'string' ||
    !b.voiceId
  )
    return undefined;
  return {
    operation: 'voice_enrollment',
    unit: 'enrollment',
    quantity: 1,
    unitPriceUsd: b.unitPriceUsd,
    costUsd: b.costUsd,
    voiceId: b.voiceId,
  };
}
