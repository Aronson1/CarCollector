"use client";
import Image from "next/image";
import axios from "axios";
import { useState } from "react";
import { set } from "mongoose";
import { Line } from "react-chartjs-2";
const fetchUrl = "http://localhost:4000/api/Announcements/17";

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
  price: number[];
  labelCode: string;
  timestamp: Date;
}

export default function Home() {
  const [cars, setCars] = useState<Car[]>([]);
  const [filteredId, setFilteredId] = useState<number>();
  const [brand, setBrand] = useState<string>();
  const [model, setModel] = useState<string>();
  const filteredCars = cars?.filter((car) => car.id === filteredId);
  const filteredBrand = cars?.filter((car) => car.brand === brand);
  const filteredModel = cars?.filter((car) => car.model === model);
  const uniqueBrands = [...new Set(cars?.map((car) => car.brand))] as string[];
  const uniqueModels = [...new Set(cars?.map((car) => car.model))] as string[];

  console.log("filtered id", filteredId);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <div className="flex flex-col items-center justify-center w-full max-w-5xl gap-8 px-4 py-8 mx-auto mt-8 text-center bg-white rounded-xl shadow-lg dark:bg-neutral-800/30 lg:flex-row lg:gap-16 lg:mt-0">
          <button
            className="px-4 py-2 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500"
            onClick={async () => {
              try {
                const response = await axios.get(fetchUrl, {
                  params: {
                    orderBy: "createdAt|desc",
                    pageNumber: 1,
                    pageSize: 200,
                    priceType: "net",
                    purchaseOption: "release",
                  },
                });

                console.log(
                  "response",
                  response?.data?.announcements.announcements
                );

                await axios.post(
                  "http://localhost:5000/api/saveCar",
                  response?.data?.announcements.announcements,
                  {
                    baseURL: "http://localhost:5000",
                  }
                );
              } catch (error) {
                console.error("Błąd podczas pobierania danych", error);
              }
            }}
          >
            Fetch and save data
          </button>
          <button
            className="px-4 py-2 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500"
            onClick={() => {
              axios
                .get("http://localhost:5000/api/getCars", {
                  baseURL: "http://localhost:5000",
                })
                .then((response) => {
                  // console.log("response", response);
                  setCars(response?.data);
                });
            }}
          >
            Get data from database
          </button>
        </div>

        <p className="fixed items-center left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Car Collector
        </p>
        <p className=" items-center left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          <label>
            Filter by ID:
            <input
              type="number"
              value={filteredId || ""}
              onChange={(e) => setFilteredId(Number(e.target.value))}
              className="w-24 px-2 py-1 text-center border border-gray-300 rounded-lg dark:border-neutral-700 dark:bg-zinc-800/30 dark:text-white lg:w-auto lg:px-4 lg:py-2 lg:rounded-xl lg:border-gray-300 lg:dark:border-neutral-700 lg:dark:bg-zinc-800/30 lg:dark:text-white"
            />
          </label>
          Filter by brand:
          <select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
            }}
            className="w-24 px-2 py-1 text-center border border-gray-300 rounded-lg dark:border-neutral-700 dark:bg-zinc-800/30 dark:text-white lg:w-auto lg:px-4 lg:py-2 lg:rounded-xl lg:border-gray-300 lg:dark:border-neutral-700 lg:dark:bg-zinc-800/30 lg:dark:text-white"
          >
            <option value="">Select a brand</option>
            {uniqueBrands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </p>

        {filteredCars && (
          <div className="flex flex-col w-full max-w-5xl gap-8 px-4 py-8 mx-auto mt-8 text-center bg-white rounded-xl shadow-lg dark:bg-neutral-800/30 lg:flex-row lg:gap-16 lg:mt-0">
            <h3 className="text-2xl font-semibold">
              Ilość {filteredCars?.length}
            </h3>
            {filteredCars?.map((car) => (
              <div
                key={`${car.id}-${car.fullName}-${car.timestamp}`}
                className="flex flex-col"
              >
                <h2 className="mt-4 text-xl font-semibold">
                  <a href={car.offerUrl} target="_blank">
                    {car.fullName}
                  </a>
                </h2>
                <p className="mt-2 text-sm text-gray-500">ID: {car.id}</p>
                <p className="mt-2 text-sm text-gray-500">Brand: {car.brand}</p>
                <p className="mt-2 text-sm text-gray-500">
                  Price:{" "}
                  {new Intl.NumberFormat("pl-PL", {
                    style: "currency",
                    currency: "PLN",
                  }).format(car.price[0])}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Date: {new Date(car.timestamp).toLocaleString()}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Label: {car.labelCode || "-"}
                </p>
              </div>
            ))}
          </div>
        )}
        {cars && (
          <div className="flex flex-col items-center justify-center w-full max-w-5xl gap-8 px-4 py-8 mx-auto mt-8 text-center bg-white rounded-xl shadow-lg dark:bg-neutral-800/30 lg:flex-row lg:gap-16 lg:mt-0">
            <h3 className="text-2xl font-semibold">Ilość {cars?.length}</h3>
            {cars
              ?.sort((a, b) => (b.id as number) - (a.id as number))
              .map((car) => (
                <div
                  key={`${car.id}-${car.fullName}-${car.timestamp}`}
                  className="flex flex-col items-center"
                >
                  <h2 className="mt-4 text-xl font-semibold">
                    <a href={car.offerUrl} target="_blank">
                      {car.fullName}
                    </a>
                  </h2>
                  <p
                    className="mt-2 text-sm text-gray-500"
                    style={{ cursor: "pointer" }}
                    onClick={() => setFilteredId(car.id)}
                  >
                    ID: {car.id}
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Brand: {car.brand}
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Price:{" "}
                    {new Intl.NumberFormat("pl-PL", {
                      style: "currency",
                      currency: "PLN",
                    }).format(car.price[0])}
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Date: {new Date(car.timestamp).toLocaleString()}
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Label: {car.labelCode || "-"}
                  </p>
                </div>
              ))}
          </div>
        )}

        <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
          <a
            className="pointer-events-none flex place-items-center gap-2 p-8 lg:pointer-events-auto lg:p-0"
            href="https://vercel.com?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            By{" "}
            <Image
              src="/vercel.svg"
              alt="Vercel Logo"
              className="dark:invert"
              width={100}
              height={24}
              priority
            />
          </a>
        </div>
      </div>

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-4 lg:text-left">
        {/* <a
          href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2 className={`mb-3 text-2xl font-semibold`}>
            Docs{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Find in-depth information about Next.js features and API.
          </p>
        </a>

        <a
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2 className={`mb-3 text-2xl font-semibold`}>
            Learn{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Learn about Next.js in an interactive course with&nbsp;quizzes!
          </p>
        </a>

        <a
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2 className={`mb-3 text-2xl font-semibold`}>
            Templates{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
            Explore starter templates for Next.js.
          </p>
        </a>

        <a
          href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2 className={`mb-3 text-2xl font-semibold`}>
            Deploy{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className={`m-0 max-w-[30ch] text-sm opacity-50 text-balance`}>
            Instantly deploy your Next.js site to a shareable URL with Vercel.
          </p>
        </a> */}
      </div>
    </main>
  );
}
