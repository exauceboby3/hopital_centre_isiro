import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppointmentStatus,
  ExamStatus,
  HospitalizationStatus,
  InvoiceStatus,
  AttendanceStatus,
  ConsultationStatus,
  Role,
  ShiftStatus,
} from '@prisma/client';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { hospitalDayRange, OPERATIONAL_CYCLE_MARKER_QUERY } from '../common/hospital-time';
import { hospitalAttendanceMoment, hospitalUtcOffsetMinutes } from '../auth/auth.constants';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  private readonly hospitalUtcOffsetMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.hospitalUtcOffsetMinutes = hospitalUtcOffsetMinutes(
      config.get('HOSPITAL_UTC_OFFSET_MINUTES', '120'),
    );
  }

  async summary(user: AuthenticatedUser) {
    const now = new Date();
    const { start, end } = hospitalDayRange(now);
    const cycleMarker = await this.prisma.auditLog.findFirst(OPERATIONAL_CYCLE_MARKER_QUERY);
    const cycleStartedAt = cycleMarker?.createdAt ?? null;
    const activityStartedAt = cycleStartedAt && cycleStartedAt > start ? cycleStartedAt : start;
    const consultationCreatedAt =
      activityStartedAt === cycleStartedAt
        ? { gt: activityStartedAt, lt: end }
        : { gte: activityStartedAt, lt: end };
    const cycleCreatedAt = cycleStartedAt ? { createdAt: { gt: cycleStartedAt } } : {};
    const attendanceStart = hospitalAttendanceMoment(
      now,
      this.hospitalUtcOffsetMinutes,
    ).attendanceDate;
    const attendanceEnd = new Date(attendanceStart);
    attendanceEnd.setUTCDate(attendanceEnd.getUTCDate() + 1);
    const canSeeFinance = hasAnyRole(user, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.CASHIER,
      Role.ACCOUNTANT,
    ]);
    const canSeeStock = hasAnyRole(user, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.PHARMACIST,
      Role.STOREKEEPER,
    ]);
    const canSeePatients = hasAnyRole(user, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.RECEPTIONIST,
      Role.SECRETARY,
      Role.DOCTOR,
      Role.NURSE,
      Role.SURGEON,
      Role.MIDWIFE,
      Role.RADIOLOGIST,
    ]);
    const canSeeAppointments = hasAnyRole(user, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.RECEPTIONIST,
      Role.SECRETARY,
      Role.DOCTOR,
      Role.NURSE,
      Role.SURGEON,
      Role.MIDWIFE,
    ]);
    const canSeeClinical = hasAnyRole(user, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.DOCTOR,
      Role.NURSE,
      Role.SURGEON,
      Role.MIDWIFE,
    ]);
    const canSeeLaboratory = hasAnyRole(user, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.DOCTOR,
      Role.LAB_TECHNICIAN,
    ]);
    const canSeeDoctorAvailability = canSeeAppointments;
    const canSuperviseJourneys = hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN]);

    const [
      patients,
      appointmentsToday,
      consultationsToday,
      pendingExams,
      activeHospitalizations,
      totalBeds,
      pendingRevenue,
      lowStock,
      unreadMessages,
      presentStaff,
      absentStaff,
      onDutyStaff,
      doctorsBusy,
      doctorsTotal,
      myAttendance,
    ] = await Promise.all([
      canSeePatients
        ? this.prisma.patient.count({ where: { archivedAt: null, ...cycleCreatedAt } })
        : Promise.resolve(null),
      canSeeAppointments
        ? this.prisma.appointment.count({
            where: {
              scheduledAt: { gte: start, lt: end },
              ...(cycleStartedAt ? { createdAt: { gt: cycleStartedAt } } : {}),
              status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CHECKED_IN] },
            },
          })
        : Promise.resolve(null),
      canSeeClinical
        ? this.prisma.consultation.count({
            where: { createdAt: consultationCreatedAt },
          })
        : Promise.resolve(null),
      canSeeLaboratory
        ? this.prisma.examRequest.count({
            where: {
              status: { in: [ExamStatus.REQUESTED, ExamStatus.IN_PROGRESS, ExamStatus.COMPLETED] },
              ...(cycleStartedAt ? { requestedAt: { gt: cycleStartedAt } } : {}),
            },
          })
        : Promise.resolve(null),
      canSeeClinical
        ? this.prisma.hospitalization.count({
            where: {
              status: HospitalizationStatus.ACTIVE,
              ...(cycleStartedAt ? { admittedAt: { gt: cycleStartedAt } } : {}),
            },
          })
        : Promise.resolve(null),
      canSeeClinical ? this.prisma.bed.count() : Promise.resolve(null),
      canSeeFinance
        ? this.prisma.invoice.aggregate({
            where: {
              status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID] },
            },
            _sum: { total: true },
          })
        : Promise.resolve(null),
      canSeeStock
        ? this.prisma.medication.count({
            where: {
              isActive: true,
              stockQuantity: { lte: this.prisma.medication.fields.minimumStock },
            },
          })
        : Promise.resolve(null),
      this.prisma.message.count({ where: { receiverId: user.id, readAt: null } }),
      this.prisma.attendanceRecord.count({
        where: {
          date: { gte: attendanceStart, lt: attendanceEnd },
          status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          date: { gte: attendanceStart, lt: attendanceEnd },
          status: AttendanceStatus.ABSENT,
        },
      }),
      this.prisma.staffShift.count({
        where: {
          startsAt: { lte: now },
          endsAt: { gte: now },
          status: { in: [ShiftStatus.PLANNED, ShiftStatus.CONFIRMED] },
        },
      }),
      canSeeDoctorAvailability
        ? this.prisma.consultation.count({ where: { status: ConsultationStatus.IN_PROGRESS } })
        : Promise.resolve(null),
      canSeeDoctorAvailability
        ? this.prisma.doctorProfile.count({ where: { user: { isActive: true } } })
        : Promise.resolve(null),
      this.prisma.attendanceRecord.findFirst({
        where: {
          employeeId: user.id,
          date: { gte: attendanceStart, lt: attendanceEnd },
        },
        orderBy: { date: 'desc' },
      }),
    ]);

    const [journeyGroups, recentJourneys] = canSuperviseJourneys
      ? await Promise.all([
          this.prisma.appointment.groupBy({
            by: ['journeyStage'],
            where: {
              status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CHECKED_IN] },
              ...cycleCreatedAt,
            },
            _count: { _all: true },
          }),
          this.prisma.appointment.findMany({
            where: {
              status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CHECKED_IN] },
              ...cycleCreatedAt,
            },
            orderBy: { journeyUpdatedAt: 'desc' },
            take: 12,
            select: {
              id: true,
              journeyStage: true,
              journeyUpdatedAt: true,
              service: true,
              patient: {
                select: {
                  medicalRecordNumber: true,
                  lastName: true,
                  postName: true,
                  firstName: true,
                },
              },
              doctor: { select: { lastName: true, postName: true, firstName: true } },
            },
          }),
        ])
      : [[], []];

    return {
      patients,
      appointmentsToday,
      consultationsToday,
      pendingExams,
      activeHospitalizations,
      totalBeds,
      occupancyRate:
        totalBeds && activeHospitalizations !== null
          ? Math.round((activeHospitalizations / totalBeds) * 100)
          : null,
      pendingRevenue: pendingRevenue ? Number(pendingRevenue._sum.total ?? 0) : null,
      lowStock,
      unreadMessages,
      presence: {
        present: presentStaff,
        absent: absentStaff,
        onDuty: onDutyStaff,
        mine: myAttendance,
      },
      doctors: {
        total: doctorsTotal,
        busy: doctorsBusy,
        available:
          doctorsTotal !== null && doctorsBusy !== null
            ? Math.max(0, doctorsTotal - doctorsBusy)
            : null,
      },
      supervision: {
        enabled: canSuperviseJourneys,
        byStage: journeyGroups.map((entry) => ({
          stage: entry.journeyStage,
          count: entry._count._all,
        })),
        recentJourneys,
      },
      operationalCycleStartedAt: cycleStartedAt,
      visibility: {
        finance: canSeeFinance,
        stock: canSeeStock,
        patients: canSeePatients,
        appointments: canSeeAppointments,
        consultations: canSeeClinical,
        laboratory: canSeeLaboratory,
        hospitalizations: canSeeClinical,
        doctorAvailability: canSeeDoctorAvailability,
      },
    };
  }
}
