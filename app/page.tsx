"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Register chart components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface Details {
  mileage: number;
  registrationYear: number;
  fuelTypeLabel: string;
  gearbox: string;
  warrantyMonths: number;
}

interface Car {
  id: number;
  offerUrl: string;
  imageUrl: string;
  fullName: string;
  brand: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
  firstRegistrationDate: string;
  registrationNumber: string;
  details: Details;
  price: number[]; // Array of prices at different timestamps
  labelCode: string;
  timestamp: Date | Date[]; // Single timestamp or array of timestamps
}

export default function Home() {
  const fetchUrl = "http://localhost:4000/api/Announcements/17";
  const [cars, setCars] = useState<Car[]>([]);
  const [filteredCars, setFilteredCars] = useState<Car[]>([]); // Store filtered cars
  const [filteredId, setFilteredId] = useState<number | null>(null);
  const [model, setModel] = useState<string>("");
  const [brand, setBrand] = useState<string>("");
  const [selectedCar, setSelectedCar] = useState<number | null>(null); // Store selected car ID for chart
  const [scrollVisible, setScrollVisible] = useState<boolean>(false); // State to show scroll button
  const [loading, setLoading] = useState<boolean>(false); // State to show loading status

  // Fetch all cars from the database on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true); // Set loading to true before fetching
      try {
        const response = await axios.get("http://localhost:5000/api/getCars");
        const sortedCars: Car[] = response.data.sort(
          (a: Car, b: Car) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setCars(sortedCars);
        setFilteredCars(sortedCars); // Initially show all cars
      } catch (error) {
        console.error("Error fetching cars:", error);
      } finally {
        setLoading(false); // Set loading to false after fetching
      }
    };
    fetchData();
  }, []);

  // Fetch and save data function
  const fetchAndSaveData = async () => {
    try {
      const response = await axios.get(fetchUrl, {
        params: {
          orderBy: "createdAt|desc",
          pageNumber: 1,
          pageSize: 400,
          priceType: "net",
          purchaseOption: "release",
        },
      });

      await axios.post(
        "http://localhost:5000/api/saveCar",
        response?.data?.announcements.announcements
      );
    } catch (error) {
      console.error("Błąd podczas pobierania danych", error);
    }
  };

  // Filter cars based on the current filter state
  const handleFilter = () => {
    const result = cars
      .filter((car) => (filteredId ? car.id === filteredId : true))
      .filter((car) =>
        model ? car.model.toLowerCase().includes(model.toLowerCase()) : true
      )
      .filter((car) =>
        brand ? car.brand.toLowerCase().includes(brand.toLowerCase()) : true
      );

    setFilteredCars(result); // Update state with filtered cars
  };

  // Narrow data to unique IDs
  const narrowData = () => {
    const uniqueCars = cars.filter(
      (car, index, self) => index === self.findIndex((c) => c.id === car.id)
    );
    setFilteredCars(uniqueCars);
  };

  // Show all entries with the same ID
  const showAllEntries = (id: number) => {
    const sameIdCars = cars.filter((car) => car.id === id);
    setFilteredCars(sameIdCars);
  };

  // Reset filter to show all cars
  const resetFilter = () => {
    setFilteredCars(cars);
  };

  // Show cars with price changes
  const showPriceChanges = () => {
    const carsGroupedById = cars.reduce((acc, car) => {
      if (!acc[car.id]) {
        acc[car.id] = [];
      }
      acc[car.id].push(car);
      return acc;
    }, {} as Record<number, Car[]>);

    const carsWithPriceChanges = Object.values(carsGroupedById)
      .filter((carGroup) => {
        const prices = carGroup.flatMap((car) =>
          car.price.filter((price) => price !== 0)
        );
        const uniquePrices = new Set(prices);
        return uniquePrices.size > 1;
      })
      .map((carGroup) => carGroup[0]); // Select only one occurrence of each car ID

    setFilteredCars(carsWithPriceChanges);
  };

  // Show/Hide Scroll Button based on scroll position
  const handleScroll = () => {
    const scrollPosition = window.scrollY;
    setScrollVisible(scrollPosition > 200);
  };

  // Scroll to top function
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Effect to track scroll position
  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="flex flex-col w-full max-w-5xl items-center justify-center gap-8">
        {/* Buttons Section */}
        <div className="flex flex-col w-full gap-4 lg:flex-row lg:justify-between">
          <button
            className="px-4 py-2 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500"
            onClick={fetchAndSaveData}
          >
            Fetch and save data
          </button>
          <button
            className="px-4 py-2 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500"
            onClick={narrowData}
          >
            Narrow Data
          </button>
          <button
            className="px-4 py-2 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500"
            onClick={resetFilter}
          >
            Reset
          </button>
          <button
            className="px-4 py-2 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500"
            onClick={showPriceChanges}
          >
            Show Price Changes
          </button>
        </div>

        {/* Filters Section */}
        <div className="flex flex-col w-full lg:flex-row lg:justify-between lg:items-center gap-4">
          <label className="flex flex-col">
            Filter by ID:
            <input
              type="number"
              value={filteredId || ""}
              onChange={(e) =>
                setFilteredId(e.target.value ? Number(e.target.value) : null)
              }
              className="w-24 px-2 py-1 text-center border border-gray-300 rounded-lg"
            />
          </label>

          <label className="flex flex-col">
            Filter by Model:
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-24 px-2 py-1 text-center border border-gray-300 rounded-lg"
            />
          </label>

          <label className="flex flex-col">
            Filter by Brand:
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-24 px-2 py-1 text-center border border-gray-300 rounded-lg"
            />
          </label>

          <button
            className="px-4 py-2 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-500"
            onClick={handleFilter} // Call filtering function on click
          >
            Filter
          </button>
        </div>

        {/* Loading Message */}
        {loading && (
          <p className="text-center text-lg text-blue-600">Loading...</p>
        )}

        {/* Cars Section */}
        <div className="flex flex-col w-full gap-8">
          <h3 className="text-2xl font-semibold">
            Cars Count: {filteredCars.length}
          </h3>
          {filteredCars.length === 0 ? (
            <p className="text-center text-gray-500">
              No cars found matching your criteria.
            </p>
          ) : (
            filteredCars.map((car) => (
              <div
                key={`${car.id}-${car.fullName}-${car.timestamp}`}
                className="flex flex-col items-center p-4 bg-white rounded-lg shadow-lg"
              >
                <h2 className="mt-4 text-xl font-semibold">
                  <a
                    href={car.offerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {car.fullName}
                  </a>
                </h2>
                <p className="mt-2 text-sm text-gray-500">ID: {car.id}</p>
                <p className="mt-2 text-sm text-gray-500">Brand: {car.brand}</p>
                <p className="mt-2 text-sm text-gray-500">Model: {car.model}</p>
                <p className="mt-2 text-sm text-gray-500">
                  Price: {car.price[0]}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Date:{" "}
                  {new Date(
                    Array.isArray(car.timestamp)
                      ? car.timestamp[0]
                      : car.timestamp
                  ).toLocaleString()}
                </p>
                <button
                  className="px-4 py-2 mt-4 font-semibold text-white bg-green-600 rounded-lg hover:bg-green-500"
                  onClick={() => setSelectedCar(car.id)}
                >
                  Pokaż wykres
                </button>
                <button
                  className="px-4 py-2 mt-4 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500"
                  onClick={() => showAllEntries(car.id)}
                >
                  Show all entries
                </button>

                {/* Show chart for selected car */}
                {selectedCar === car.id && (
                  <div className="w-full max-w-4xl mt-8">
                    <Line
                      data={{
                        labels: cars
                          .filter((c) => c.id === car.id)
                          .flatMap((c) =>
                            Array.isArray(c.timestamp)
                              ? c.timestamp
                                  .map((timestamp, index) =>
                                    c.price[index] !== 0
                                      ? new Date(timestamp).toLocaleString()
                                      : null
                                  )
                                  .filter((timestamp) => timestamp !== null)
                              : c.price[0] !== 0
                              ? [new Date(c.timestamp).toLocaleString()]
                              : []
                          ),
                        datasets: [
                          {
                            label: `${car.model} Price Over Time`,
                            data: cars
                              .filter((c) => c.id === car.id)
                              .flatMap((c) =>
                                c.price.filter((price) => price !== 0)
                              ),
                            borderColor: "rgba(75, 192, 192, 1)",
                            backgroundColor: "rgba(75, 192, 192, 0.2)",
                            fill: false,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        plugins: {
                          legend: {
                            position: "top",
                          },
                          title: {
                            display: true,
                            text: "Price Changes Over Time",
                          },
                        },
                      }}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Scroll to Top Button */}
        {scrollVisible && (
          <button
            className="fixed bottom-10 right-10 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-500"
            onClick={scrollToTop}
          >
            ↑ Scroll to top
          </button>
        )}
      </div>
    </main>
  );
}
