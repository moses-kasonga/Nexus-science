import type { Language } from "./courses";
import { activeLanguage } from "./i18n";

/** Messages d'erreur des écrans enseignant et administration (hors composants React, donc langue lue au moment de l'erreur). */
const fr = {
    generic: "Une erreur est survenue. Réessayez.", unnamed: "Compte sans nom",
    coursesLoad: "Les cours n'ont pas pu être chargés.", courseSave: "Le cours n'a pas pu être enregistré.", courseDelete: "Le cours n'a pas pu être supprimé.",
    scheduleAdd: "La session n'a pas pu être ajoutée (vérifiez que la date de fin n'est pas avant le début).", scheduleUpdate: "La session n'a pas pu être modifiée.", scheduleDelete: "La session n'a pas pu être supprimée.",
    peopleLoad: "La liste des comptes n'a pas pu être chargée.", lessonsLoad: "Les leçons de ce cours n'ont pas pu être chargées.", lessonSave: "La leçon n'a pas pu être enregistrée.", lessonDelete: "La leçon n'a pas pu être supprimée.",
    enrollmentsLoad: "Les inscriptions n'ont pas pu être chargées.", invitationsLoad: "Les invitations n'ont pas pu être chargées.", applicationsLoad: "Les candidatures n'ont pas pu être chargées.",
    applicationApprove: "La candidature n'a pas pu être approuvée.", applicationReject: "La candidature n'a pas pu être refusée.",
    checkingAccess: "Vérification des accès…", antiBot: "Vérification anti-robot",
};

type Messages = { [K in keyof typeof fr]: string };

const messages: Record<Language, Messages> = {
  fr,
  en: {
    generic: "Something went wrong. Please try again.", unnamed: "Unnamed account",
    coursesLoad: "Courses could not be loaded.", courseSave: "The course could not be saved.", courseDelete: "The course could not be deleted.",
    scheduleAdd: "The session could not be added (check that the end date is not before the start date).", scheduleUpdate: "The session could not be updated.", scheduleDelete: "The session could not be deleted.",
    peopleLoad: "The list of accounts could not be loaded.", lessonsLoad: "The lessons of this course could not be loaded.", lessonSave: "The lesson could not be saved.", lessonDelete: "The lesson could not be deleted.",
    enrollmentsLoad: "Enrolments could not be loaded.", invitationsLoad: "Invitations could not be loaded.", applicationsLoad: "Applications could not be loaded.",
    applicationApprove: "The application could not be approved.", applicationReject: "The application could not be rejected.",
    checkingAccess: "Checking access…", antiBot: "Anti-bot verification",
  },
  pt: {
    generic: "Ocorreu um erro. Tente novamente.", unnamed: "Conta sem nome",
    coursesLoad: "Não foi possível carregar os cursos.", courseSave: "Não foi possível guardar o curso.", courseDelete: "Não foi possível eliminar o curso.",
    scheduleAdd: "Não foi possível adicionar a sessão (verifique se a data de fim não é anterior ao início).", scheduleUpdate: "Não foi possível alterar a sessão.", scheduleDelete: "Não foi possível eliminar a sessão.",
    peopleLoad: "Não foi possível carregar a lista de contas.", lessonsLoad: "Não foi possível carregar as lições deste curso.", lessonSave: "Não foi possível guardar a lição.", lessonDelete: "Não foi possível eliminar a lição.",
    enrollmentsLoad: "Não foi possível carregar as inscrições.", invitationsLoad: "Não foi possível carregar os convites.", applicationsLoad: "Não foi possível carregar as candidaturas.",
    applicationApprove: "Não foi possível aprovar a candidatura.", applicationReject: "Não foi possível recusar a candidatura.",
    checkingAccess: "A verificar os acessos…", antiBot: "Verificação anti-robô",
  },
  es: {
    generic: "Ha ocurrido un error. Inténtalo de nuevo.", unnamed: "Cuenta sin nombre",
    coursesLoad: "No se pudieron cargar los cursos.", courseSave: "No se pudo guardar el curso.", courseDelete: "No se pudo eliminar el curso.",
    scheduleAdd: "No se pudo añadir la sesión (comprueba que la fecha de fin no sea anterior al inicio).", scheduleUpdate: "No se pudo modificar la sesión.", scheduleDelete: "No se pudo eliminar la sesión.",
    peopleLoad: "No se pudo cargar la lista de cuentas.", lessonsLoad: "No se pudieron cargar las lecciones de este curso.", lessonSave: "No se pudo guardar la lección.", lessonDelete: "No se pudo eliminar la lección.",
    enrollmentsLoad: "No se pudieron cargar las inscripciones.", invitationsLoad: "No se pudieron cargar las invitaciones.", applicationsLoad: "No se pudieron cargar las solicitudes.",
    applicationApprove: "No se pudo aprobar la solicitud.", applicationReject: "No se pudo rechazar la solicitud.",
    checkingAccess: "Comprobando accesos…", antiBot: "Verificación anti-robot",
  },
};

export type MessageKey = keyof Messages;
export const message = (key: MessageKey): string => messages[activeLanguage()][key];
export const adminMessages = messages;
