import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pomoc | Car Collector",
  description: "Opis funkcji aplikacji Car Collector.",
};

const featureGroups = [
  {
    title: "Panel ofert",
    description:
      "Główny widok do przeglądania aktualnie zapisanych ofert samochodów.",
    features: [
      {
        name: "Typy ofert",
        description:
          "Przełączanie między najmem używanych, zakupem używanych i najmem nowych aut. Każdy typ ma osobną listę, filtry i historię cen.",
      },
      {
        name: "Filtrowanie ofert",
        description:
          "Wyszukiwanie po ID, marce i modelu oraz zawężanie po roczniku, przebiegu, mocy, paliwie, skrzyni biegów, czasie kontraktu, limicie kilometrów i wpłacie własnej.",
      },
      {
        name: "Szybkie przełączniki",
        description:
          "Filtry pozwalają pokazać tylko oferty ze zmianą ceny, tylko dostępne auta albo tylko pozycje dodane do watchlisty.",
      },
      {
        name: "Sortowanie i paginacja",
        description:
          "Listę można sortować po dacie, cenie, mocy, zmianie ceny i ocenie okazji. Liczbę wyników na stronie można dopasować do sposobu pracy.",
      },
      {
        name: "Karty samochodów",
        description:
          "Każda oferta pokazuje zdjęcia, status dostępności, cenę netto, zmianę ceny, parametry auta, historię cen, wyposażenie i link do zewnętrznej oferty.",
      },
      {
        name: "Galeria zdjęć",
        description:
          "Zdjęcia można powiększyć w podglądzie, przełączać klawiaturą lub gestem oraz przeglądać miniatury zapisane dla oferty.",
      },
      {
        name: "Historia ceny",
        description:
          "Aplikacja zapisuje kolejne snapshoty cen i pokazuje, ile punktów historii ma dana oferta oraz jaka była ostatnia zmiana ceny.",
      },
    ],
  },
  {
    title: "Watchlista",
    description:
      "Lista obserwowanych aut, które wymagają szybkiego powrotu bez ponownego filtrowania.",
    features: [
      {
        name: "Dodawanie i usuwanie aut",
        description:
          "Oferty można oznaczać jako obserwowane z panelu ofert, a na stronie watchlisty usuwać je jednym przyciskiem.",
      },
      {
        name: "Podział według typu oferty",
        description:
          "Watchlista działa osobno dla najmu używanych, zakupu używanych i najmu nowych aut.",
      },
      {
        name: "Priorytet okazji",
        description:
          "Pozycje na watchliście są pobierane z oceną okazji, dzięki czemu łatwiej porównać potencjalnie najlepsze auta.",
      },
    ],
  },
  {
    title: "Dashboard trendów",
    description:
      "Widok syntetyczny do monitorowania zmian w całej bazie ofert.",
    features: [
      {
        name: "Metryki zbiorcze",
        description:
          "Dashboard pokazuje liczbę ofert, nowe auta z dzisiaj i ostatnich 7 dni, spadki cen, niedostępne auta oraz średnie ceny dla typów ofert.",
      },
      {
        name: "Trendy cen modeli",
        description:
          "Wykres porównuje średnie ceny najczęściej obserwowanych modeli w wybranym okresie trendu.",
      },
      {
        name: "Największe obniżki",
        description:
          "Osobna sekcja wskazuje auta z największym spadkiem ceny względem poprzedniego snapshotu.",
      },
      {
        name: "Średnie ceny",
        description:
          "Zestawienie pokazuje modele z największą liczbą obserwacji i ich średnią aktualną cenę.",
      },
      {
        name: "Zmiany dostępności",
        description:
          "Lista ostatnich zdarzeń pokazuje auta, które pojawiły się po raz pierwszy, wróciły albo zniknęły z ofert.",
      },
      {
        name: "Status ostatniego collectora",
        description:
          "Nagłówek dashboardu informuje, kiedy ostatnio zakończyło się pobieranie danych i czy przebiegło poprawnie.",
      },
    ],
  },
  {
    title: "Ustawienia i operacje",
    description:
      "Ekran administracyjny do kontroli stanu aplikacji i ręcznego uruchamiania procesów.",
    features: [
      {
        name: "Status bazy danych",
        description:
          "Aplikacja pokazuje, czy połączenie z MongoDB działa i kiedy status został odświeżony.",
      },
      {
        name: "Ręczne pobieranie ofert",
        description:
          "Collectory można uruchomić z interfejsu osobno dla każdego typu oferty: najmu używanych, zakupu używanych i najmu nowych.",
      },
      {
        name: "Uzupełnianie galerii",
        description:
          "Dla ofert zakupu używanych można ręcznie uzupełnić galerie zdjęć i wyposażenie pobrane z danych szczegółowych.",
      },
      {
        name: "Konfiguracja oceny okazji",
        description:
          "Można ustawić próg powiadomień push oraz wagi ceny, mocy i rocznika używane przy wyliczaniu punktacji okazji. Czynnik ceny uwzględnia też porównanie do podobnych ofert tej samej marki, modelu i typu finansowania.",
      },
      {
        name: "Historia powiadomień",
        description:
          "Po włączeniu pushy ustawienia pokazują ostatnie oferty, dla których wysłano alert okazji.",
      },
    ],
  },
  {
    title: "Automatyzacja w tle",
    description:
      "Procesy działające poza pojedynczym widokiem użytkownika.",
    features: [
      {
        name: "Codzienny collector",
        description:
          "Vercel Cron wywołuje collector raz dziennie i zapisuje nowe oferty, snapshoty cen oraz statystyki przebiegu.",
      },
      {
        name: "Śledzenie dostępności",
        description:
          "Każde pobranie oznacza widoczne auta jako dostępne, a brakujące pozycje jako niedostępne, zapisując zdarzenia powrotu i zniknięcia.",
      },
      {
        name: "Dedupikacja snapshotów",
        description:
          "Jeśli cena się nie zmieniła, aplikacja aktualizuje ostatni snapshot zamiast tworzyć duplikat historii.",
      },
      {
        name: "Ocena okazji",
        description:
          "Oferty dostają punktację 0-100 na podstawie ceny, mocy i rocznika. Cena jest wzmacniana porównaniem do podobnych ofert, więc karta może wskazać np. że auto jest 14% tańsze od porównywalnych.",
      },
      {
        name: "Alerty push",
        description:
          "W produkcji można zapisać przeglądarkę do powiadomień. Nowe oferty najmu używanych powyżej ustawionego progu wysyłają alert tylko raz.",
      },
      {
        name: "PWA",
        description:
          "Aplikacja ma manifest i service worker, dzięki czemu może działać jak instalowalny panel z obsługą powiadomień w produkcji.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-7 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">
              Car Collector
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Pomoc</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Pełna lista funkcji aplikacji z krótkim opisem tego, do czego
              służy każdy widok i proces działający w tle.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:self-start lg:self-auto">
            <NavLink href="/">Panel ofert</NavLink>
            <NavLink href="/watchlist">Watchlista</NavLink>
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/settings">Ustawienia</NavLink>
          </div>
        </header>

        <section className="grid gap-4">
          {featureGroups.map((group) => (
            <article
              className="rounded border border-slate-800 bg-slate-900 p-4"
              key={group.title}
            >
              <div className="max-w-4xl">
                <h2 className="text-lg font-semibold text-white">
                  {group.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {group.description}
                </p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.features.map((feature) => (
                  <div
                    className="rounded border border-slate-800 bg-slate-950/50 p-4"
                    key={feature.name}
                  >
                    <h3 className="text-sm font-semibold text-slate-100">
                      {feature.name}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function NavLink({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      className="min-h-12 rounded border border-slate-700 px-4 py-3 text-center text-sm font-semibold leading-tight text-slate-100 transition hover:border-cyan-400 hover:text-cyan-100"
      href={href}
    >
      {children}
    </Link>
  );
}
