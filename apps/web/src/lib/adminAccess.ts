export function isDoctorReviewStaff(uid: string) {
  return (process.env.DOCTOR_REVIEWER_UIDS || '').split(',').map(value => value.trim()).filter(Boolean).includes(uid);
}
