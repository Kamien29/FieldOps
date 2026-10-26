# Testy odbiorcze — Tydzień 4

## Testy automatyczne (bez internetu i danych produkcyjnych)

```bash
cd backend
npm test
# 13/13 testów (autoryzacja, raporty, migracje i izolowany HTTP z idempotencją)
cd ../mobile
npm run test:offline
# 5/5 testów (SQLite z Node + polityka ponawiania)
```

**Uwaga:** test SQLite wykorzystuje API `node:sqlite` w trybie eksperymentalnym. Wymaga Node 22 lub nowszego. Nie zastępuje testu modułu `expo-sqlite` na telefonie.

## Odbiór na telefonie — wykonać ręcznie

1. Po aktualizacji telefonu otwórz Expo Go SDK 58 i zaloguj się, gdy internet działa.
2. Wybierz z listy zlecenie. Włącz tryb samolotowy.
3. Dodaj **nowe zlecenie offline**. Edytuj je, następnie kliknij **Rozpocznij**.
4. Dodaj opis, zdjęcia, podpis odbierającego i zatwierdź raport. Zamknij i uruchom ponownie aplikację.
5. Nadal offline: sprawdź, czy zlecenie, raport, podpis, zdjęcia i licznik niewysłanych operacji istnieją.
6. Wyłącz tryb samolotowy. Naciśnij **Synchronizuj**. Obserwuj kolejność create → edit → status → zdjęcia → raport.
7. Otwórz stronę Vercel na innym komputerze. Sprawdź, czy zlecenie jest wykonane i ma raport ze wszystkimi zdjęciami, bez duplikatów.
8. Symuluj utratę połączenia podczas wysyłania 8 zdjęć. Włącz sieć ponownie; już przyjęte zdjęcia nie powinny zostać zapisane drugi raz.
9. Utwórz konflikt: podczas pracy offline edytuj zlecenie z telefonu i zmień to samo zlecenie w przeglądarce. Wznów sieć. Powinny pojawić się obie wersje; wybierz wariant i sprawdź wynik.
10. Sprawdź osobny konflikt podczas edycji w przeglądarce, gdy telefon wysyła nową wersję. Formularz powinien zachować lokalne pola i wyświetlić okno porównania.
11. Test wygasłej sesji: po utracie ważności tokenu niewysłane zmiany muszą pozostać w SQLite. Zaloguj się na to samo konto i ponów synchronizację.
12. Test długiej przerwy: po kilku godzinach/dniu offline wykonaj ponowne pobranie; wynik powinien zawierać tylko zaktualizowane rekordy.

### Kryteria akceptacji

- Nie giną zmiany po zamknięciu telefonu, utracie zasięgu i ponownym logowaniu.
- Ponowne wysłanie tej samej operacji nie tworzy duplikatów.
- Konflikt nie nadpisuje cudzych zmian bez decyzji.
- Przy błędzie jednego zlecenia pozostałe mogą się synchronizować.
- Raport i zdjęcia pozostają czytelne po ponownym uruchomieniu aplikacji.

**Nie oznaczaj punktów jako zaliczone, dopóki nie sprawdzisz ich na urządzeniu.**
