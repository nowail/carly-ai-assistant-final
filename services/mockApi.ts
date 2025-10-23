// services/mockApi.ts
// Car data will be loaded from CSV and cached here
let carInventory: any[] | null = null;
// Inventory validation functions
const validateCarExists = (make: string, model: string): boolean => {
  if (!carInventory) return false;
  return carInventory.some(car => 
    car.make?.toLowerCase().includes(make.toLowerCase()) &&
    car.model?.toLowerCase().includes(model.toLowerCase())
  );
};
const getAvailableMakes = (): string[] => {
  if (!carInventory) return [];
  return [...new Set(carInventory.map(c => c.make).filter(Boolean))];
};
const getAvailableModels = (make?: string): string[] => {
  if (!carInventory) return [];
  let filteredCars = carInventory;
  if (make) {
    filteredCars = carInventory.filter(c => 
      c.make?.toLowerCase().includes(make.toLowerCase())
    );
  }
  return [...new Set(filteredCars.map(c => c.model).filter(Boolean))];
};
const getAvailableTrims = (make: string, model: string): string[] => {
  if (!carInventory) return [];
  return carInventory
    .filter(c => 
      c.make?.toLowerCase().includes(make.toLowerCase()) &&
      c.model?.toLowerCase().includes(model.toLowerCase())
    )
    .map(c => c.car_name_english)
    .filter(Boolean);
};
/** ---------- JSON LOADER ---------- **/
/** ---------- INVENTORY LOADER ---------- **/
/**
 * Optimized: Loads car inventory from existing JSON file only.
 * No additional files needed - uses the existing car_inventory.json
 */
const loadInventory = async () => {
  if (carInventory !== null) return;
  try {
    // Use existing JSON file with multiple path attempts
    let data;
    let response;
    
    const paths = [
      "./car_inventory.json",
      "car_inventory.json", 
      "../car_inventory.json",
      "./services/car_inventory.json",
      "services/car_inventory.json"
    ];
    
    for (const path of paths) {
      try {
        console.log(`🔄 Attempting to load inventory from: ${path}`);
        response = await fetch(path);
        if (response.ok) {
          data = await response.json();
          console.log(`✅ JSON loaded from ${path}: ${data.length} records`);
          // Validate that we got actual data
          if (data && Array.isArray(data) && data.length > 0) {
            console.log(`📊 Sample brands found:`, [...new Set(data.slice(0, 10).map(c => c["Brands - BrandId → NameEN"]))]);
            break;
          } else {
            console.log(`⚠️ Data loaded but appears empty or invalid`);
            data = null;
          }
        } else {
          console.log(`❌ HTTP ${response.status} from ${path}`);
        }
      } catch (error) {
        console.log(`❌ Failed to load from ${path}:`, error.message);
        continue;
      }
    }
    
    if (!data) {
      throw new Error("Could not load inventory from any path");
    }
    // Parse numeric values properly (remove commas and convert)
    const parseNumeric = (str: any) => {
      if (!str || (typeof str === 'string' && str.trim() === '') || str === null || str === undefined) return null;
      // Convert to string first, then clean and parse
      const strValue = String(str).trim();
      if (strValue === '') return null;
      // Remove quotes, commas, and spaces, then convert
      const cleaned = strValue.replace(/["\s,]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    };
    // Map data to standardized format (works for both JSON and CSV)
    carInventory = data.map(car => ({
      car_id: car["car_id"],
      make: car["Brands - BrandId → NameEN"]?.trim(),
      model: car["Model"]?.trim(), // Fixed: removed extra space
      year: parseNumeric(car["Year"]), // Fixed: removed extra space
      trim: car["Car Name in english"]?.trim(),
      price: parseNumeric(car["Price"]),
      mileage: parseNumeric(car["CurrentKM"]),
      body_type: car["Body Type"]?.trim(),
      color: car["Exterior color"]?.trim(),
      transmission: car["Transmission"]?.trim(),
      fuel_type: car["Fuel type"]?.trim(),
      specs: {
        cylinder: car["Cylinder"]?.toString(),
        engine_cc: car["EngineCC"],
        fuel_tank_capacity: parseNumeric(car["FuelTankCapacity"]),
        seating_capacity: parseNumeric(car["SeatingCapacity"]),
      },
      // Include additional fields for better search
      car_name_arabic: car["Car Name in arabic"]?.trim(),
      car_name_english: car["Car Name in english"]?.trim(),
      interior_color: car["Interior color"]?.trim(), // Fixed: removed extra space
    }));
    
    // Enhanced validation and debugging
    if (carInventory.length > 0) {
      console.log(`✅ Inventory loaded: ${carInventory.length} cars`);
      console.log("Sample car:", carInventory[0].make, carInventory[0].model, carInventory[0].price);
      
      // Show unique makes loaded
      const uniqueMakes = [...new Set(carInventory.map(c => c.make).filter(Boolean))];
      console.log(`📊 Unique makes loaded: ${uniqueMakes.length}`);
      console.log("Top 10 makes:", uniqueMakes.slice(0, 10));
      
      // Show sample data for debugging
      console.log("🔍 Sample data structure:", {
        make: carInventory[0].make,
        model: carInventory[0].model,
        car_name_english: carInventory[0].car_name_english,
        car_name_arabic: carInventory[0].car_name_arabic
      });
    }
  } catch (err) {
    console.error("Error loading car inventory:", err);
    console.log("Using minimal fallback data...");
    
    // Minimal fallback - just enough to prevent errors
    carInventory = [
      {
        car_id: "FALLBACK_001",
        make: "Dodge",
        model: "Charger", 
        year: 2021,
        price: 85000,
        mileage: 100000,
        body_type: "Sedan",
        color: "White",
        transmission: "Automatic",
        fuel_type: "Petrol",
        specs: { cylinder: "6", engine_cc: "3600cc", fuel_tank_capacity: 10, seating_capacity: 5 },
        car_name_arabic: "دودج شارجر",
        car_name_english: "Dodge Charger",
        interior_color: "Black"
      }
    ];
    
    console.log(`Using minimal fallback: ${carInventory.length} car`);
  }
};
// Simple test function
export const testInventory = async () => {
  await loadInventory();
  return carInventory && carInventory.length > 0;
};
// Enhanced debugging function
export const debugInventory = async () => {
  await loadInventory();
  if (!carInventory || carInventory.length === 0) {
    return { error: "No inventory loaded" };
  }
  
  const makes = [...new Set(carInventory.map(c => c.make).filter(Boolean))];
  const models = [...new Set(carInventory.map(c => c.model).filter(Boolean))];
  
  return {
    total_cars: carInventory.length,
    unique_makes: makes.length,
    unique_models: models.length,
    makes: makes.slice(0, 20),
    models: models.slice(0, 20),
    sample_car: carInventory[0] ? {
      car_id: carInventory[0].car_id,
      make: carInventory[0].make,
      model: carInventory[0].model,
      car_name_english: carInventory[0].car_name_english,
      car_name_arabic: carInventory[0].car_name_arabic
    } : null
  };
};
/** ---------- TOOLS (INVENTORY-ONLY) ---------- **/
export const executeTool = async (name: string, args: any): Promise<any> => {
  console.log(`🔧 TOOL CALLED: ${name} with args:`, args);
  
  // Tools that require inventory
  if (["check_inventory", "get_car_specs", "get_financing_options", "reserve_car", "validate_inventory"].includes(name)) {
    await loadInventory();
    if (!carInventory || carInventory.length === 0) {
      console.log("❌ No inventory loaded");
      return JSON.stringify({ error: "No inventory data available", cars: [] });
    }
    console.log(`✅ Inventory loaded: ${carInventory.length} cars`);
  }
  switch (name) {
    case "check_inventory": {
      console.log(`check_inventory called with args:`, args);
      // ✅ Load JSON fresh every time from file
      const response = await fetch("/car_inventory.json");
      const data = await response.json();
      console.log(`📊 Loaded ${data.length} cars directly from JSON`);
      let results = [...data];
      // 🔍 Apply filters directly on raw JSON data
      if (args.make) {
        const makeFilter = String(args.make).toLowerCase().trim();
        console.log(`🔍 Searching for make: "${makeFilter}"`);
        
        // Enhanced search logic for combined make+model searches
        let detectedBrand = null;
        let remainingTerm = makeFilter;
        
        // Get unique brands from the raw JSON data
        const uniqueBrands = [...new Set(data.map(c => c["Brands - BrandId → NameEN"]).filter(Boolean))];
        
        // Try to find a brand at the beginning of the search term
        for (const brand of uniqueBrands) {
          if (typeof brand === 'string' && makeFilter.startsWith(brand.toLowerCase())) {
            detectedBrand = brand;
            remainingTerm = makeFilter.substring(brand.length).trim();
            break;
          }
        }
        
        if (detectedBrand && remainingTerm) {
          console.log(`✅ Brand detected: "${detectedBrand}", searching for: "${remainingTerm}"`);
          results = results.filter(c => {
            const brandFromJSON = c["Brands - BrandId → NameEN"]?.toLowerCase().trim() || '';
            const carNameFromJSON = c["Car Name in english"]?.toLowerCase().trim() || '';
            
            const brandMatches = brandFromJSON.includes(detectedBrand.toLowerCase());
            const carNameMatches = carNameFromJSON.includes(remainingTerm) ||
                                 carNameFromJSON.includes(remainingTerm.replace(/\s+/g, ''));
            
            return brandMatches && carNameMatches;
          });
        } else {
          console.log(`⚠️ No brand detected, using fallback search`);
          results = results.filter(c => {
            const brandFromJSON = c["Brands - BrandId → NameEN"]?.toLowerCase().trim() || '';
            const carNameEnFromJSON = c["Car Name in english"]?.toLowerCase().trim() || '';
            const carNameArFromJSON = c["Car Name in arabic"]?.toLowerCase().trim() || '';
            const modelFromJSON = c["Model"]?.toLowerCase().trim() || '';
            
            return brandFromJSON.includes(makeFilter) || 
                   carNameEnFromJSON.includes(makeFilter) || 
                   carNameArFromJSON.includes(makeFilter) ||
                   modelFromJSON.includes(makeFilter);
          });
        }
        
        console.log(`✅ Found ${results.length} cars matching make filter`);
      }
      
      if (args.model) {
        console.log(`🔍 Filtering by model: "${args.model}"`);
        const modelFilter = String(args.model).toLowerCase().trim();
        const beforeCount = results.length;
        
        results = results.filter(c => {
          const model = c["Model"]?.toLowerCase().trim() || '';
          const carNameEn = c["Car Name in english"]?.toLowerCase().trim() || '';
          const carNameAr = c["Car Name in arabic"]?.toLowerCase().trim() || '';
          
          return model.includes(modelFilter) ||
                 carNameEn.includes(modelFilter) ||
                 carNameAr.includes(modelFilter);
        });
        console.log(`✅ Found ${results.length} cars matching model filter`);
      }
      
      if (args.year) {
        const y = parseInt(String(args.year).replace(/,/g, ""), 10);
        if (!Number.isNaN(y)) results = results.filter(c => c.year === y);
      }
      
      if (args.price_max) { 
        const p = parseFloat(String(args.price_max).replace(/,/g, "")); 
        if (!Number.isNaN(p)) results = results.filter(c => c.price != null && c.price <= p); 
      }
      if (args.price_min) { 
        const p = parseFloat(String(args.price_min).replace(/,/g, "")); 
        if (!Number.isNaN(p)) results = results.filter(c => c.price != null && c.price >= p); 
      }
      if (args.mileage_max) { 
        const m = parseInt(String(args.mileage_max).replace(/,/g, ""), 10); 
        if (!Number.isNaN(m)) results = results.filter(c => c.mileage != null && c.mileage <= m); 
      }
      if (args.body_type) {
        const bodyFilter = String(args.body_type).toLowerCase();
        results = results.filter(c => c.body_type?.toLowerCase().includes(bodyFilter));
      }
      if (args.color) {
        const colorFilter = String(args.color).toLowerCase();
        results = results.filter(c => c.color?.toLowerCase().includes(colorFilter));
      }
      if (args.transmission) {
        const transFilter = String(args.transmission).toLowerCase();
        results = results.filter(c => c.transmission?.toLowerCase().includes(transFilter));
      }
      if (args.fuel_type) {
        const fuelFilter = String(args.fuel_type).toLowerCase();
        results = results.filter(c => c.fuel_type?.toLowerCase().includes(fuelFilter));
      }
      console.log(`✅ Filtered results: ${results.length} cars`);
      if (results.length === 0) {
        console.log("❌ No cars found matching criteria");
        const makes = [...new Set(data.map(c => c["Brands - BrandId → NameEN"]).filter(Boolean))].slice(0, 10);
        const models = [...new Set(data.map(c => c["Model"]).filter(Boolean))].slice(0, 10);
        console.log("Available makes:", makes);
        console.log("Available models:", models);
        return JSON.stringify({ cars: [] });
      }
      
      // Return cars with all details from raw JSON
      const formatted = results.slice(0, args.limit || 5).map(car => ({
        car_id: car.car_id,
        "Car Name in arabic": car["Car Name in arabic"],
        "Car Name in english": car["Car Name in english"],
        Model: car["Model"],
        Year: car["Year"],
        Price: car["Price"],
        CurrentKM: car["CurrentKM"],
        "Exterior color": car["Exterior color"],
        "Interior color": car["Interior color"],
        "Body Type": car["Body Type"],
        Transmission: car["Transmission"],
        "Fuel type": car["Fuel type"],
        Cylinder: car["Cylinder"],
        EngineCC: car["EngineCC"],
        FuelTankCapacity: car["FuelTankCapacity"],
        SeatingCapacity: car["SeatingCapacity"],
        Make: car["Brands - BrandId → NameEN"]
      }));
      
      console.log(`✅ Returning ${formatted.length} cars with full details`);
      return JSON.stringify({ cars: formatted });
    }
    case "get_car_specs": {
      const car = carInventory!.find(c => c.car_id === args.car_id || c.vin === args.vin);
      return car ? JSON.stringify(car.specs) : "NOT_IN_INVENTORY";
    }
    case "get_financing_options": {
      const car = carInventory!.find(c => c.car_id === args.car_id || c.vin === args.vin);
      if (!car) return "NOT_IN_INVENTORY";
      if (!car.year || car.year < 2024) return "Financing is only available for models from 2024 and 2025. This car must be paid for in cash.";
      const salary = Number(args.monthly_salary || 0);
      const down = Number(args.down_payment || 0);
      const price = car.price;
      if (salary < 4000) return "Monthly salary is too low for financing options.";
      if (price == null) return "Cannot calculate financing as the car price is not available.";
      const loan = price - down;
      const r = 0.05 / 12; // 5% APR monthly
      const n = Number(args.term_months || 60);
      const pmt = (loan * r) / (1 - Math.pow(1 + r, -n));
      return JSON.stringify({
        estimated_monthly_payment: pmt.toFixed(2),
        term_months: n,
        down_payment: down,
        car_price: price,
        note: "This is an estimate. Final approval is subject to bank verification."
      });
    }
    case "schedule_test_drive": {
      return `Test drive confirmed for car ID ${args.car_id} on ${args.date} at ${args.time}.`;
    }
    case "reserve_car": {
      const car = carInventory!.find(c => c.car_id === args.car_id || c.vin === args.vin);
      if (!car) return "NOT_IN_INVENTORY";
      return JSON.stringify({
        confirmation_id: `RES-${Date.now()}`,
        car_details: `${car.year} ${car.make} ${car.model}`,
        payment_link: `https://carly.example.com/pay/reservation/${Date.now()}`
      });
    }
    case "send_link_via_sms": {
      return JSON.stringify({
        status: 'success',
        message: 'تم إرسال رابط الحجز عبر رسالة نصية لجوالك',
        link_type: args.link_type,
        url: args.url
      });
    }
    case "handoff_to_human": {
      // Collect contact information for follow-up
      const contactInfo = {
        topic: args.topic,
        urgency: args.urgency || 'normal',
        summary: args.summary || 'Customer inquiry requiring human assistance',
        callback_number: args.callback_number || 'Not provided',
        email: args.email || 'Not provided',
        customer_name: args.customer_name || 'Not provided',
        timestamp: new Date().toISOString()
      };
      
      console.log('Handoff to human with contact info:', contactInfo);
      return JSON.stringify({
        status: 'success',
        message: `تم تسجيل استفسارك وسيتواصل معك أحد مندوبينا خلال 24 ساعة`,
        contact_info: contactInfo
      });
    }
    case "log_event": {
      const eventData = {
        intent: args.intent,
        slots: args.slots || {},
        results_count: args.results_count || 0,
        next_action: args.next_action,
        notes: args.notes || '',
        timestamp: new Date().toISOString()
      };
      
      console.log('Event logged:', eventData);
      return JSON.stringify({
        status: 'success',
        message: 'Event logged successfully',
        event_data: eventData
      });
    }
    case "validate_inventory": {
      await loadInventory();
      if (!carInventory || carInventory.length === 0) {
        return JSON.stringify({
          error: "No inventory data available",
          available_makes: [],
          available_models: [],
          available_trims: []
        });
      }
      const make = args.make?.toLowerCase();
      const model = args.model?.toLowerCase();
      
      const validation = {
        car_exists: make && model ? validateCarExists(make, model) : null,
        available_makes: getAvailableMakes(),
        available_models: make ? getAvailableModels(make) : getAvailableModels(),
        available_trims: make && model ? getAvailableTrims(make, model) : [],
        total_cars: carInventory.length
      };
      console.log('Inventory validation:', validation);
      return JSON.stringify(validation);
    }
    case "debug_inventory": {
      const debugInfo = await debugInventory();
      console.log('Debug inventory info:', debugInfo);
      return JSON.stringify(debugInfo);
    }
    default:
      return "Unknown tool.";
  }
};