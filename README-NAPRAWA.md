# FieldOps – naprawa formularzy i duplikowania firm

## Rozwiązane błędy
- `Cannot read properties of null (reading 'reset')` – po `await` `event.currentTarget` było `null`. Pięć formularzy korzysta teraz z przechwyconej wcześniej referencji do elementu `<form>`.
- Ponowne kliknięcie przycisku podczas wykonywania zapisu jest blokowane do chwili zakończenia żądania.
- Backend dla `POST /api/organizations` serializuje tworzenie firm w ramach jednego właściciela (blokada PostgreSQL) i przy ponowieniu tej samej nazwy zwraca istniejący rekord. Ponowienie daje HTTP 200 i `created:false`; pierwsze utworzenie – HTTP 201 i `created:true`.

## Instalacja do obecnego projektu (Windows Git Bash)

1. Rozpakuj ZIP w osobnym katalogu, np. `~/Downloads/FieldOps-NAPRAWA-FIRMY-CZAT`.
2. Uruchom:

```bash
cd ~/Downloads/FieldOps-NAPRAWA-FIRMY-CZAT
bash INSTALUJ-NAPRAWE.sh ~/Documents/fieldops
cd ~/Documents/fieldops/backend
npm test
```

Instalator **najpierw weryfikuje oryginalne pliki**, następnie robi kopię i nadpisuje tylko trzy wskazane pliki. Jeśli pliki się różnią od paczki bazowej, **zatrzymuje się przed dokonaniem jakichkolwiek zmian**. Przy niestandardowej wersji zastosuj ręczne scalenie. Nic nie jest automatycznie wysyłane na GitHub ani Vercel.

## Co z pięcioma firmami „balisticok”?

Poprawka **nie usuwa żadnej** z istniejących firm. To odrębne rekordy w bazie, nie tylko wizualny błąd listy. Przed porządkowaniem w Neon uruchom wyłącznie poniższe **zapytanie odczytowe** w SQL Editor na właściwej gałęzi bazy:

```sql
SELECT o.id, o.name, o.created_at,
       (SELECT count(*) FROM organization_members m WHERE m.organization_id=o.id) AS members,
       (SELECT count(*) FROM jobs j WHERE j.organization_id=o.id) AS jobs,
       (SELECT count(*) FROM organization_invitations i WHERE i.organization_id=o.id) AS invitations,
       (SELECT count(*) FROM organization_messages m WHERE m.organization_id=o.id) AS messages,
       (SELECT count(*) FROM job_offers f WHERE f.organization_id=o.id) AS offers
FROM organizations o
WHERE lower(o.name) = lower('balisticok')
ORDER BY o.created_at, o.id;
```

Dopiero po obejrzeniu wyników i wykonaniu backupu można wybrać, które puste kopie usunąć. NIE wykonuj masowego `DELETE FROM organizations`: może usunąć potrzebne powiązania lub złamać więzy bazy. Właściciel firmy nie może jej usunąć zwykłym formularzem w bieżącej wersji.

## Testy
- `node --check fieldops-web/public/team.js` – poprawnie
- `node --check backend/src/team-api.js` – poprawnie
- `npm test` w `backend/` – 21/21 zaliczonych w środowisku testowym bez Neon.

**Nie wymaga nowej migracji SQL.** Po lokalnych testach do aktualizacji Vercel konieczne jest wdrożenie poprawionego frontendu i backendu. Samo wdrożenie pliku `team.js` na stronie usunie błąd `reset`; backendowe blokowanie duplikatów wymaga również nowego `team-api.js`.
