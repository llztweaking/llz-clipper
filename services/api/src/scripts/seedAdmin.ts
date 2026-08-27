import "dotenv/config";
import { prisma } from "@llz-clipper/database";
import { seedAdmin } from "../services/seedAdminService";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const email = getArg("email");
  const password = getArg("password");

  if (!email || !password) {
    console.error("Uso: npm run seed:admin -- --email=admin@exemplo.com --password=senha-forte");
    process.exit(1);
  }

  const user = await seedAdmin(email, password);
  console.log(`Usuário admin pronto: ${user.email} (id: ${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
