

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 5000;

mongoose.connect('mongodb://localhost:27017/carCollectorDB', { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.connection.once('open', () => {
  console.log('Połączono z bazą danych MongoDB');
});

app.use(cors()); 
app.options('*', cors()); 
app.use(bodyParser.json({ limit: '100mb' }));

const Car = mongoose.model('Car', {
  id: Number,
  offerUrl: String,
  imageUrl: String,
  fullName: String,
  brand: String,
  model: String,
  createdAt: Date,
  updatedAt: Date,
  firstRegistrationDate: String,
  registrationNumber: String,
  labelCode: String,
  details: {
    mileage: Number,
    registrationYear: Number,
    fuelTypeLabel: String,
    gearbox: String,
    warrantyMonths: Number,
  },
  price: [Number],
  timestamp: { type: Date, default: Date.now },
});

app.post('/api/saveCar', async (req, res) => {
  console.log('body', req.body[0])
  try {
    for (const carData of req.body) {
      const newCar = new Car({
        id: carData.id,
        offerUrl: carData.offerUrl,
        imageUrl: carData.mainUrl,
        fullName: carData.trim,
        brand: carData.make,
        model: carData.model,
        createdAt: carData.createdAt,
        updatedAt: carData.updatedAt,
        firstRegistrationDate: carData.firstRegistrationDate,
        registrationNumber: carData.registrationNumber,
        details: carData.details,
        labelCode: carData.labelCode,
        price: [carData.reLeasePriceNet, carData.reLeasePrice2Net, carData.reLeasePrice3Net],
      });

      await newCar.save();
    }
    res.status(200).json({ success: true, message: 'Dane zapisane pomyślnie.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Wystąpił błąd podczas zapisywania danych.' });
  }
});

app.get('/api/getCars', async (req, res) => {
  try {
    const cars = await Car.find();
    console.log('get cars', cars.filter(car => car.brand === 'Volvo'));
    res.status(200).json(cars);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Wystąpił błąd podczas pobierania danych.' });
  }
});

app.listen(port, () => {
  console.log(`Serwer uruchomiony na porcie ${port}`);
});
