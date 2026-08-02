import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();
const clinicianRoles = [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE];

async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: clinicianRoles }, doctorProfile: null },
    include: { staffProfile: true },
  });
  for (const user of users) {
    const staff = user.staffProfile;
    await prisma.$transaction(async (transaction) => {
      await transaction.doctorProfile.create({
        data: {
          userId: user.id,
          lastName: staff?.lastName ?? user.username,
          postName: staff?.postName,
          firstName: staff?.firstName,
          specialty: staff?.specialty?.trim() || 'Médecine générale',
          grade: staff?.grade,
          phone: staff?.phone,
          address: staff?.address,
        },
      });
      if (staff) await transaction.staffProfile.delete({ where: { userId: user.id } });
    });
  }
  console.log(`Profils cliniciens réparés : ${users.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
