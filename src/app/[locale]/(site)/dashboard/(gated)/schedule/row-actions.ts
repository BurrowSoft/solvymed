"use server";

import { liveFeatures } from "@/lib/liveFeatures";
import { inRowPractice } from "@/lib/rowPractice";
import { updateAppointmentStatus, moveAppointment, deleteAppointment, getScheduleDay } from "./actions";
import { confirmBookingAndAddPatient, rejectBooking, proposeNewTime, acceptRescheduleRequest, declineRescheduleRequest } from "./booking-actions";
import { markPaid, markUnpaid, setPaymentAmount } from "../payments/actions";

// The "All" schedule (166): a row's action runs for THAT row's doctor (the
// acting practice for this call only; c6 B3). Only these actions, each the
// normal one with its own checks; the practice is re-checked against hers
// (actingPracticeFor) and again by the database.
const ROW_ACTIONS = {
  updateAppointmentStatus, moveAppointment, deleteAppointment, getScheduleDay,
  confirmBookingAndAddPatient, rejectBooking, proposeNewTime, acceptRescheduleRequest, declineRescheduleRequest,
  markPaid, markUnpaid, setPaymentAmount,
};
export type RowActions = typeof ROW_ACTIONS;
export type RowActionName = keyof RowActions;

export async function actForRow(practiceId: string, name: RowActionName, args: unknown[]): Promise<unknown> {
  const fn = ROW_ACTIONS[name] as ((...a: unknown[]) => Promise<unknown>) | undefined;
  if (!liveFeatures.multiPractice || !fn) throw new Error("not_available");
  return inRowPractice(practiceId, () => fn(...args));
}
