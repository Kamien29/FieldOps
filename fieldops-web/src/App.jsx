
import { useState } from "react";
import "./App.css";

const poczatkoweZlecenia = [
  {
    id: 1,
    tytul: "Naprawa klimatyzacji",
    klient: "Jan Kowalski",
    adres: "Rzeszów",
    status: "Do wykonania",
  },
  {
    id: 2,
    tytul: "Przegląd urządzenia",
    klient: "Anna Nowak",
    adres: "Łańcut",
    status: "W realizacji",
  },
];

export default function App() {
  const [zlecenia, setZlecenia] = useState(
    poczatkoweZlecenia
  );

  const [tytul, setTytul] = useState("");
  const [klient, setKlient] = useState("");
  const [adres, setAdres] = useState("");
  const [filtr, setFiltr] = useState("Wszystkie");

  function dodajZlecenie(e) {
    e.preventDefault();

    if (!tytul.trim() || !klient.trim() || !adres.trim()) {
      alert("Uzupełnij wszystkie pola.");
      return;
    }

    const noweZlecenie = {
      id: Date.now(),
      tytul: tytul.trim(),
      klient: klient.trim(),
      adres: adres.trim(),
      status: "Do wykonania",
    };

    setZlecenia((poprzednie) => [
      noweZlecenie,
      ...poprzednie,
    ]);

    setTytul("");
    setKlient("");
    setAdres("");
  }

  function zmienStatus(id) {
    setZlecenia((poprzednie) =>
      poprzednie.map((zlecenie) => {
        if (zlecenie.id !== id) return zlecenie;

        const nastepnyStatus = {
          "Do wykonania": "W realizacji",
          "W realizacji": "Wykonane",
          "Wykonane": "Do wykonania",
        };

        return {
          ...zlecenie,
          status: nastepnyStatus[zlecenie.status],
        };
      })
    );
  }

  function usunZlecenie(id) {
    const potwierdzenie = window.confirm(
      "Czy na pewno usunąć to zlecenie?"
    );

    if (!potwierdzenie) return;

    setZlecenia((poprzednie) =>
      poprzednie.filter((z) => z.id !== id)
    );
  }

  const widoczneZlecenia = zlecenia.filter((z) =>
    filtr === "Wszystkie" ? true : z.status === filtr
  );

  return (
    <main className="aplikacja">
      <header className="naglowek">
        <div>
          <p className="nadtytul">SYSTEM SERWISOWY</p>
          <h1>FieldOps</h1>
          <p>Zarządzaj zleceniami serwisowymi.</p>
        </div>
        <span className="licznik">
          Zlecenia: {zlecenia.length}
        </span>
      </header>

      <section className="panel">
        <h2>Dodaj nowe zlecenie</h2>

        <form onSubmit={dodajZlecenie}>
          <label>
            Nazwa zlecenia
            <input
              value={tytul}
              onChange={(e) => setTytul(e.target.value)}
              placeholder="Np. naprawa pompy"
            />
          </label>

          <label>
            Klient
            <input
              value={klient}
              onChange={(e) => setKlient(e.target.value)}
              placeholder="Imię i nazwisko"
            />
          </label>

          <label>
            Adres
            <input
              value={adres}
              onChange={(e) => setAdres(e.target.value)}
              placeholder="Adres wykonania usługi"
            />
          </label>

          <button type="submit">+ Dodaj zlecenie</button>
        </form>
      </section>

      <section className="lista">
        <div className="lista-naglowek">
          <h2>Lista zleceń</h2>

          <select
            value={filtr}
            onChange={(e) => setFiltr(e.target.value)}
            aria-label="Filtruj zlecenia według statusu"
          >
            <option>Wszystkie</option>
            <option>Do wykonania</option>
            <option>W realizacji</option>
            <option>Wykonane</option>
          </select>
        </div>

        {widoczneZlecenia.length === 0 ? (
          <p>Brak zleceń do wyświetlenia.</p>
        ) : (
          widoczneZlecenia.map((z) => (
            <article className="zlecenie" key={z.id}>
              <div className="zlecenie-info">
                <h3>{z.tytul}</h3>
                <p>Klient: {z.klient}</p>
                <p>Adres: {z.adres}</p>
                <span className="status">{z.status}</span>
              </div>

              <div className="akcje">
                <button onClick={() => zmienStatus(z.id)}>
                  Zmień status
                </button>
                <button
                  className="usun"
                  onClick={() => usunZlecenie(z.id)}
                >
                  Usuń
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
