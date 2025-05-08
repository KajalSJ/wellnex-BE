const getAllTimeZones = () => {
    return Intl.supportedValuesOf("timeZone");
  };
  
  export default getAllTimeZones;