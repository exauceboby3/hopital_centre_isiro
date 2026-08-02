import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  AttendanceStatus,
  ConsultationStatus,
  PatientJourneyStage,
  ShiftStatus,
} from '@prisma/client';
import { hospitalDayRange } from '../common/hospital-time';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DoctorAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const now = new Date();
    const { start, end } = hospitalDayRange(now);

    const doctors = await this.prisma.doctorProfile.findMany({
      where: { user: { isActive: true } },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            attendanceRecords: { where: { date: { gte: start, lt: end } }, take: 1 },
            staffShifts: {
              where: {
                startsAt: { lte: now },
                endsAt: { gte: now },
                status: { in: [ShiftStatus.PLANNED, ShiftStatus.CONFIRMED] },
              },
              take: 1,
            },
          },
        },
        consultations: {
          where: { status: ConsultationStatus.IN_PROGRESS },
          include: {
            patient: true,
            appointment: { select: { journeyStage: true } },
          },
          orderBy: { startedAt: 'desc' },
        },
        appointments: {
          where: {
            status: AppointmentStatus.CHECKED_IN,
            scheduledAt: { gte: start, lt: end },
            doctorAcknowledgedAt: null,
          },
          include: { patient: true },
          orderBy: { scheduledAt: 'asc' },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return doctors.map((doctor) => {
      const attendance = doctor.user.attendanceRecords[0];
      const activeConsultation = doctor.consultations.find(
        (consultation) =>
          !consultation.appointment ||
          consultation.appointment.journeyStage === PatientJourneyStage.IN_CONSULTATION,
      );
      const present =
        attendance?.status === AttendanceStatus.PRESENT ||
        attendance?.status === AttendanceStatus.LATE ||
        doctor.user.staffShifts.length > 0;

      return {
        id: doctor.id,
        userId: doctor.user.id,
        username: doctor.user.username,
        name: [doctor.lastName, doctor.postName, doctor.firstName].filter(Boolean).join(' '),
        specialty: doctor.specialty,
        availability: activeConsultation ? 'BUSY' : present ? 'AVAILABLE' : 'UNKNOWN',
        attendanceStatus: attendance?.status ?? null,
        onDuty: doctor.user.staffShifts.length > 0,
        currentPatient: activeConsultation?.patient ?? null,
        waitingPatients: doctor.appointments.map((appointment) => appointment.patient),
      };
    });
  }
}
