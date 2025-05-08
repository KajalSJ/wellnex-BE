import jwt from "jsonwebtoken";
import moment from "moment";
import CryptoJS from "crypto-js";
import config from "../configurations/app.config.js";

const generateToken = (user) => {
    return jwt.sign(
      {
        iss: config.JWT_ISS,
        sub: user,
        iat: new Date().getTime(),
        exp: new Date().setDate(
          new Date().getDate() + Number(config.JWT_EXPIRY)
        ),
      },
      String(config.JWT_SECRET)
    );
  },
  verifyToken = (token) => {
    return jwt.verify(token, String(config.JWT_SECRET));
  },
  generateTokenForSevenDays = (user, expireDay) => {
    return jwt.sign(
      {
        iss: config.JWT_ISS,
        sub: user,
        iat: new Date().getTime(),
        exp: new Date().setDate(new Date().getDate() + Number(expireDay)),
      },
      String(config.JWT_SECRET)
    );
  },
  getDaysArray = (start, end) => {
    let date = [];
    while (moment(start) <= moment(end)) {
      date.push({
        start: moment(start).format("DD/MMM/YYYY"),
        count: 0,
        year: moment(start).format("YYYY"),
        date: moment(start).format("DD"),
        month: moment(start).format("MMM"),
      });
      start = moment(start).add(1, "days");
    }
    return date;
  },
  timeInternalDiffrence = async (start, end) => {
    let msec,
      hh,
      mm,
      ss,
      diff,
      startTime = new Date(start),
      endTime = new Date(end);
    diff = endTime.getTime() - startTime.getTime();
    msec = diff;
    hh = Math.floor(msec / 1000 / 60 / 60);
    msec -= hh * 1000 * 60 * 60;
    mm = Math.floor(msec / 1000 / 60);
    msec -= mm * 1000 * 60;
    ss = Math.floor(msec / 1000);
    msec -= ss * 1000;
    return hh + ":" + mm + ":" + ss;
  },
  generateOTP = (length) => {
    let digits = "0123456789",
      OTP = "";
    for (let i = 0; i < length; i++) {
      OTP += digits[Math.floor(Math.random() * 10)];
    }
    return OTP;
  },
  addMinutesToCurrentTime = (minutes) => {
    return new Date(new Date().getTime() + minutes * 60000);
  },
  daysBetweenTwoDates = (dateStart, dateEnd) => {
    let date1 = new Date(dateStart),
      date2 = new Date(dateEnd),
      Difference_In_Time = date2.getTime() - date1.getTime(),
      Difference_In_Days = Difference_In_Time / (1000 * 3600 * 24);
    return Difference_In_Days;
  },
  totalTimeBetween = (t1, t2) => {
    const time1 = moment(t1, "HH:mm");
    const time2 = moment(t2, "HH:mm");
    const totalTimeMinutes = time2.diff(time1, "minutes");
    if (totalTimeMinutes < 0) {
      const nextDay = moment.duration(1, "days");
      const midnight = moment("00:00", "HH:mm");
      const timeUntilMidnight = midnight.diff(time1, "minutes");
      const timeAfterMidnight = time2.diff(midnight, "minutes");
      return timeUntilMidnight + timeAfterMidnight;
    }
    return totalTimeMinutes;
  },
  encryptData = (data) => {
    return CryptoJS.AES.encrypt(data, config.JWT_SECRET).toString();
  },
  decryptData = (encryptedData) => {
    const bytes = CryptoJS.AES.decrypt(encryptedData, config.JWT_SECRET);
    return bytes.toString(CryptoJS.enc.Utf8);
  },
  helpers = {
    generateToken,
    encryptData,
    totalTimeBetween,
    decryptData,
    verifyToken,
    // daysBetweenTwoDates,
    getDaysArray,
    daysBetweenTwoDates,
    generateOTP,
    addMinutesToCurrentTime,
    timeInternalDiffrence,
    generateTokenForSevenDays,
  };

export default helpers;
