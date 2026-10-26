# API współpracy FieldOps — kontrakt

Wszystkie endpointy wymagają sesji (`fieldops_session` HttpOnly dla WWW albo Bearer dla Expo). Operacje WWW wymagają nagłówka `X-Requested-With: fieldops-web` przy modyfikacjach sesyjnych, tak jak w dotychczasowym API. Daty w bazie są zapisywane jako ciągi ISO.

| Endpoint | Metoda | Dostęp i działanie |
|---|---|---|
| `/api/me/avatar` | GET / PUT / DELETE | Własny awatar (PUT: JSON `{mime,dataBase64}`, JPEG/PNG/WebP do 300 KiB) |
| `/api/organizations` | GET | Firmy, których użytkownik jest członkiem |
| `/api/organizations` | POST | Tworzy firmę i członkostwo `owner`; `{name}` |
| `/api/organizations/:id/members` | GET | Lista członków, tylko członkowie |
| `/api/organizations/:id/members/:userId/avatar` | GET | Awatar członka, tylko członkowie tej firmy |
| `/api/organizations/:id/invites` | POST | Owner/admin zaprasza po e-mailu `{email}` |
| `/api/invitations` | GET | Oczekujące zaproszenia dla aktualnego e-maila |
| `/api/invitations/:id/accept` | POST | Przyjmuje zaproszenie (adres e-mail musi pasować) |
| `/api/invitations/:id/decline` | POST | Odrzuca zaproszenie |
| `/api/organizations/:id/leave` | POST | Opuszcza firmę, jeżeli nie ma firmowych zleceń i nie jest właścicielem |
| `/api/organizations/:id/members/:userId` | DELETE | Owner/admin usuwa członka (nie właściciela i nie osobę mającą firmowe zlecenia) |
| `/api/organizations/:id/jobs` | GET | Lista metadanych zleceń firmy dla jej członków, bez treści raportu/zdjęć |
| `/api/organizations/:id/jobs` | POST | Tworzy firmowe zlecenie przypisane do twórcy; `{title,customer,address,description,scheduledAt}` |
| `/api/job-offers` | GET | Wysłane i otrzymane propozycje dotyczące użytkownika |
| `/api/job-offers` | POST | Proponuje przekazanie własnego zlecenia `{jobId,toEmail}` |
| `/api/job-offers/:id/accept` | POST | Odbiorca akceptuje, backend sprawdza właściciela, wersję i członkostwo, a potem zmienia `assigned_to` |
| `/api/job-offers/:id/decline` | POST | Odbiorca odmawia |
| `/api/job-offers/:id/cancel` | POST | Nadawca wycofuje ofertę |
| `/api/organizations/:id/messages` | GET / POST | Kanał całej firmy (GET ostatnie 80; POST `{content}`) |
| `/api/organizations/:id/messages/:userId` | GET / POST | Czat prywatny z członkiem tej samej firmy (GET ostatnie 80; POST `{content}`) |

## Model danych

`organizations` → `organization_members` → `organization_invitations`.

`jobs.organization_id` opcjonalnie wiąże zlecenie z firmą. Dotychczasowe prywatne zlecenia zachowują `NULL` i pozostają prywatne.

`job_offers` przechowuje `sender_id`, `recipient_id`, `job_id`, `job_version` oraz status. Zmiana `assigned_to` odbywa się dopiero przy `accept`, wewnątrz transakcji i po sprawdzeniu niezmienionej wersji.

`organization_messages` przechowuje wiadomości grupowe (`recipient_id IS NULL`) i prywatne (`recipient_id` wskazuje odbiorcę). Pobieranie prywatnych wiadomości wymaga, by obie strony były członkami firmy.

`users.avatar_mime/avatar_data` przechowuje mały awatar jako `BYTEA`. Brak awatara oznacza oba pola `NULL`.

## Świadome ograniczenia pierwszej wersji

Brak powiadomień e-mail/push, brak podziału na rozbudowane role projektowe, brak przekazywania właścicielstwa firmy, brak kanałów projektowych, brak załączników w czacie, brak szyfrowania end-to-end i limitowania liczby zapytań. Wszyscy członkowie firmy widzą metadane zleceń firmowych; pełen raport i zdjęcia są nadal chronione przez przypisanie do wykonawcy.
