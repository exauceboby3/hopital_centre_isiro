import { Injectable } from '@nestjs/common';
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
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthenticatedUser) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const now = new Date();
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
        ? this.prisma.patient.count({ where: { archivedAt: null } })
        : Promise.resolve(null),
      canSeeAppointments
        ? this.prisma.appointment.count({
            where: {
              scheduledAt: { gte: start, lt: end },
              status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CHECKED_IN] },
            },
          })
        : Promise.resolve(null),
      canSeeClinical
        ? this.prisma.consultation.count({ where: { createdAt: { gte: start, lt: end } } })
        : Promise.resolve(null),
      canSeeLaboratory
        ? this.prisma.examRequest.count({
            where: {
              status: { in: [ExamStatus.REQUESTED, ExamStatus.IN_PROGRESS, ExamStatus.COMPLETED] },
            },
          })
        : Promise.resolve(null),
      canSeeClinical
        ? this.prisma.hospitalization.count({ where: { status: HospitalizationStatus.ACTIVE } })
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
          date: { gte: start, lt: end },
          status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
        },
      }),
      this.prisma.attendanceRecord.count({
        where: { date: { gte: start, lt: end }, status: AttendanceStatus.ABSENT },
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
        where: { employeeId: user.id, date: { gte: start, lt: end } },
        orderBy: { date: 'desc' },
      }),
    ]);

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
