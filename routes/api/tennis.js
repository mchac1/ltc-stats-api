const { Router } = require('express')
const db = require("../../db");

const router = Router()


router.get('/', (req, res) => {
    res.status(200).json({ name: 'Jestin' })
})

router.get('/getReservationCountByMember', async (req, res) => {
    console.log("CAM called getReservationCountByMember");
    let matchQuery = {
        "Reservation Type": {
          $in: ["Singles", "Doubles"],
        },
        "Is Event?": false,
      }
    if (req.query.Year) {
        matchQuery["Start Date / Time"] = { $regex: req.query.Year }
    }
    var reservationsArray = await db.getDB().collection('reservations').aggregate( [
        {
          $match: matchQuery
        },
        {
          $group: {
            '_id': { 'member': '$Created By' },
            totalQuantity: {
              $sum: 1,
            },
          },
        },
      ]).toArray();
      
    res.status(200).json(reservationsArray)
})

router.get('/getReservationCountByMonth', async (req, res) => {
    console.log("CAM called getReservationCountByMonth");
    let matchQuery = {
        "Is Event?": false,
      }
    if (req.query.Year) {
        matchQuery["Start Date / Time"] = { $regex: req.query.Year }
    }

    var reservationsArray = await db.getDB().collection('reservations').aggregate( [
        {
            $match: matchQuery
        },
        {
          $addFields: {
            month: {
              $substr: ['$Start Date / Time', 5, 2]
            }
          }
        },
        {
          $group: {
            _id: { month: '$month' },
            totalQuantity: { $sum: 1 }
          }
        }
      ],).toArray();

    reservationsArray.sort((a, b) => a._id.month.localeCompare(b._id.month));
      
    res.status(200).json(reservationsArray)
})

// Converts to military time
// (e.g. 1:00 PM -> 13:00)
const convertTime12to24 = (time12h) => {
    const [time, modifier] = time12h.split(' ');
  
    let [hours, minutes] = time.split(':');
  
    if (hours === '12') {
      hours = '00';
    }
  
    if (modifier === 'PM') {
      hours = parseInt(hours, 10) + 12;
    }
  
    return `${hours}:${minutes}`;
}

const getTimeOnCourt = (start, end) => {
    return ( new Date("1970-1-1 " + convertTime12to24(end)) - new Date("1970-1-1 " + convertTime12to24(start)) ) / 1000 / 60 / 60;
}

const getPrimeTimeOnCourt = (resDate, start, end) => {

    const primeTimeStartNum = 17;
    const primeTimeEndNum = 21;
    const primeTimeStart = '17:00';
    const primeTimeEnd = '21:00';
    const weekdays = [ 0, 1, 2, 3, 4 ];
    const theStart = convertTime12to24(start);
    const theEnd = convertTime12to24(end);
    const theDate = new Date(resDate);

    // No prime time on weekends
    const isWeekday = weekdays.includes(theDate.getDay());
    if (!isWeekday) {
        return 0;
    }

    const [startHours, startMinutes] = theStart.split(':');
    const startsInPrimeTime = parseInt(startHours) >= primeTimeStartNum && parseInt(startHours) <= primeTimeEndNum;
    const [endHours, endMinutes] = theEnd.split(':');
    const endsInPrimeTime = parseInt(endHours) >= primeTimeStartNum && parseInt(endHours) <= primeTimeEndNum;

    let newFinalStart = primeTimeStart;
    let newFinalEnd = primeTimeEnd;

    if (startsInPrimeTime && endsInPrimeTime) {
        newFinalStart = theStart;
        newFinalEnd = theEnd;
    } else if (startsInPrimeTime) {
        newFinalStart = theStart;
    } else if (endsInPrimeTime) {
        newFinalEnd = theEnd;
    } else {
        return 0;
    }

    return getTimeOnCourt(newFinalStart, newFinalEnd);
}

const getReservationInstructor = (reservationRecord) => {
    let instructor = reservationRecord['Instructor(s)']
    if (!instructor) {
        instructor = reservationRecord['Created By']
    }
    return instructor
}

router.get('/getMemberYearlyHours', async (req, res) => {
    console.log("CAM called getMemberYearlyHours");

    const memberId = req.query.Member;
    // const memberId = "485052"

    let reservationsQuery = {
        "Is Event?": false,
        "Members": { $regex: memberId }
      }

    var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

    const yearlyArray = [];

    reservationsArray.forEach((item) => {

        // Parse time of day out of date field
        const startDate = item['Start Date / Time'];
        const endDate = item['End Date / Time'];
        const [delme1, startTimeOfDay, startAmPm] = startDate.split(' ');
        const startTime = `${startTimeOfDay} ${startAmPm}`;
        const [delme2, endTimeOfDay, endAmPm] = endDate.split(' ');
        const endTime = `${endTimeOfDay} ${endAmPm}`;

        // Calculate time on court in hours for this reservation
        const timeOnCourt = getTimeOnCourt(startTime, endTime);
        const primeTimeOnCourt = getPrimeTimeOnCourt(startDate, startTime, endTime);

        // determine year by getting first 4 chars of start date
        const year = item["Start Date / Time"].substring(0, 4);

        const yearMatch = yearlyArray.find(a => a.year === year);

        if (yearMatch) {
            yearMatch.totalBookings++;
            
            yearMatch.hoursOnCourt += timeOnCourt;
            yearMatch.primetimeHoursOnCourt += primeTimeOnCourt;
            if (item['Reservation Type'] === "Singles") {
                yearMatch.singlesBookings++;
                yearMatch.singlesHours += timeOnCourt;
            } else if (item['Reservation Type'] === "Doubles") {
                yearMatch.doublesBookings++;
                yearMatch.doublesHours += timeOnCourt;
            } else if (item['Reservation Type'] === "Private Lesson") {
                yearMatch.lessonBookings++;
                yearMatch.lessonHours += timeOnCourt;
            } else {
                yearMatch.otherBookings++;
                yearMatch.otherHours += timeOnCourt;
            }
        } else {
            let toPush = {
                year: year,
                hoursOnCourt: timeOnCourt,
                primetimeHoursOnCourt: primeTimeOnCourt,
                totalBookings: 1,
                singlesBookings: 0,
                singlesHours: 0,
                doublesBookings: 0,
                doublesHours: 0,
                lessonBookings: 0,
                lessonHours: 0,
                otherBookings: 0,
                otherHours: 0,
            };
            if (item['Reservation Type'] === "Singles") {
                toPush.singlesBookings = 1;
                toPush.singlesHours = timeOnCourt;
            } else if (item['Reservation Type'] === "Doubles") {
                toPush.doublesBookings = 1;
                toPush.doublesHours = timeOnCourt;
            } else if (item['Reservation Type'] === "Private Lesson") {
                toPush.lessonBookings = 1;
                toPush.lessonHours = timeOnCourt;
            } else {
                toPush.otherBookings = 1;
                toPush.otherHours = timeOnCourt;
            }
            yearlyArray.push(toPush)
        }
    });

    yearlyArray.sort((a, b) => a.year.localeCompare(b.year));

    res.status(200).json(yearlyArray)
});

router.get('/getAverageMonthlyAttendance', async (req, res) => {
    console.log("CAM called getAverageMonthlyAttendance");

    let reservationsQuery = {
        "Is Event?": true,
      }

    if (req.query.ResType) {
        reservationsQuery["Reservation Type"] = req.query.ResType;
    }
    if (req.query.EventName) {
        reservationsQuery["Event Name"] = req.query.EventName;
    }
    if (req.query.Year) {
        reservationsQuery["Start Date / Time"] = { $regex: req.query.Year }
    }

    var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

    const monthlyArray = [];

    reservationsArray.forEach((item) => {

        // determine year by getting first 4 chars of start date
        const month = item["Start Date / Time"].substring(0, 7);

        const monthMatch = monthlyArray.find((a) => {
            return a.month === month
        })

        if (monthMatch) {
            monthMatch.count++;
            monthMatch.total += item["Members Count"]
        } else {
            let toPush = {
                month: month,
                total: item["Members Count"],
                count: 1,
            };
            monthlyArray.push(toPush)
        }
    });

    monthlyArray.sort((a, b) => {
        return a.month.localeCompare(b.month);
    });

    res.status(200).json(monthlyArray)
});

router.get('/getAverageAttendance', async (req, res) => {
    console.log("CAM called getAverageAttendance");

    let reservationsQuery = {
        "Is Event?": true,
      }

    if (req.query.ResType) {
        reservationsQuery["Reservation Type"] = req.query.ResType;
    }
    if (req.query.EventName) {
        reservationsQuery["Event Name"] = req.query.EventName;
    }

    var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

    const yearlyArray = [];

    reservationsArray.forEach((item) => {

        // determine year by getting first 4 chars of start date
        const year = item["Start Date / Time"].substring(0, 4);

        const yearMatch = yearlyArray.find((a) => {
            return a.year === year
        })

        if (yearMatch) {
            yearMatch.count++;
            yearMatch.total += item["Members Count"]
        } else {
            let toPush = {
                year: year,
                total: item["Members Count"],
                count: 1,
            };
            yearlyArray.push(toPush)
        }
    });

    res.status(200).json(yearlyArray)
});

router.get('/getLeagueAttendance', async (req, res) => {
    console.log("CAM called getLeagueAttendance");

    let reservationsQuery = {
        "Is Event?": true,
      }
    if (req.query.Year) {
        reservationsQuery["Start Date / Time"] = { $regex: req.query.Year }
    }
    if (req.query.ResType) {
        reservationsQuery["Reservation Type"] = req.query.ResType;
    }
    if (req.query.EventName) {
        reservationsQuery["Event Name"] = req.query.EventName;
    }

    var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

    res.status(200).json(reservationsArray)
});


router.get('/getLeagueTopPlayers', async (req, res) => {
    console.log("CAM called getLeagueTopPlayers");

    // const eventName = req.query.EventName;
    // const reservationType = req.query.ResType;

    let reservationsQuery = {
        // "Reservation Type": "Evening Leagues",
        // "Event Name": eventName,
        "Is Event?": true,
      }
    if (req.query.Year) {
        reservationsQuery["Start Date / Time"] = { $regex: req.query.Year }
    }
    if (req.query.ResType) {
        reservationsQuery["Reservation Type"] = req.query.ResType;
    }
    if (req.query.EventName) {
        reservationsQuery["Event Name"] = req.query.EventName;
    }

    var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

    let memberSummary = []

    reservationsArray.forEach((oneRes) => {

        // If no members associated with reservation, skip it
        const members = oneRes.Members;
        if (!members) { return }

        // Members field contains comma-separated list of 
        // players in that reservation. Need to parse them out.
        // e.g. "Donna Lee Pon (#207216), Paulette Trudelle (#210277), Adriana Garcia (#209420), Sandra Harazny (#207532)"
        let commaSplit = members.split(', ')

        commaSplit.forEach((piece) => {
            let newPieces = piece.split(' (#')
            let memberName = newPieces[0];
            let memberId = newPieces[1].replace(')','');;

            let memberMatch = memberSummary.find(a => a.id === memberId);
            if (memberMatch) {
                memberMatch.count++;
            } else {
                let toPush = {
                    name: memberName,
                    id: memberId,
                    count: 1,
                };
                memberSummary.push(toPush)
            }
        })
    });

    memberSummary.sort((a, b) => b.count - a.count);
    res.status(200).json(memberSummary)
});

router.get('/getFamilyHours', async (req, res) => {
    console.log("CAM called getFamilyHours");

    let reservationsQuery = {
        "Reservation Type": {
          $in: ["Singles", "Doubles", "Backboard (only court 8)", "Ball Machine"],
        },
        "Is Event?": false,
      }
    if (req.query.Year) {
        reservationsQuery["Start Date / Time"] = { $regex: req.query.Year }
    }

    var membersArray = await db.getDB().collection('members').find({}).toArray();
    // console.log(membersArray)
    var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

    let memberHours = []

    reservationsArray.forEach((oneRes) => {

        // If no members associated with reservation, skip it
        const members = oneRes.Members;
        if (!members) { return }

        // Parse time of day out of date field
        const startDate = oneRes['Start Date / Time'];
        const endDate = oneRes['End Date / Time'];
        const [delme1, startTimeOfDay, startAmPm] = startDate.split(' ');
        const startTime = `${startTimeOfDay} ${startAmPm}`;
        const [delme2, endTimeOfDay, endAmPm] = endDate.split(' ');
        const endTime = `${endTimeOfDay} ${endAmPm}`;

        // Calculate time on court in hours for this reservation
        const timeOnCourt = getTimeOnCourt(startTime, endTime);
        const primeTimeOnCourt = getPrimeTimeOnCourt(startDate, startTime, endTime);

        // Members field contains comma-separated list of 
        // players in that reservation. Need to parse them out.
        // e.g. "Donna Lee Pon (#207216), Paulette Trudelle (#210277), Adriana Garcia (#209420), Sandra Harazny (#207532)"
        let commaSplit = members.split(', ')

        // Assemble array showing hours on court for each member
        commaSplit.forEach((piece) => {
            let newPieces = piece.split(' (#')
            let memberName = newPieces[0];
            let memberId = newPieces[1].replace(')','');;

            let memberMatch = memberHours.find(a => a.name === memberName);
            // let memberMatch = memberHours.find(a => a.id === memberId);
            if (memberMatch) {
                memberMatch.count++;
                memberMatch.hoursOnCourt = memberMatch.hoursOnCourt + timeOnCourt;
                memberMatch.primeTimeOnCourt = memberMatch.primeTimeOnCourt + primeTimeOnCourt;
            } else {
                let toPush = {
                    name: memberName,
                    id: memberId,
                    count: 1,
                    hoursOnCourt: timeOnCourt,
                    primeTimeOnCourt: primeTimeOnCourt
                };
                memberHours.push(toPush)
            }
        })
    });

    // memberHours.sort((a, b) => b.hoursOnCourt - a.hoursOnCourt);

    const famsArray = [];

    // If a member has Family ID, then they are part of
    // a family membership. For those members, find time
    // on court from the array assembled above to calculate
    // time on court by family.
    membersArray.forEach((oneMem) => {
        if (oneMem['Family ID']) {
            const memberMatch = memberHours.find(a => a.id === oneMem['Member #'].toString())
            const famMatch = famsArray.find(a => a.familyId === oneMem['Family ID'])
            if (famMatch) {
                famMatch.familyMembers++;
                if (memberMatch) {
                    famMatch.hours = famMatch.hours + memberMatch.hoursOnCourt;
                    famMatch.primeTimeOnCourt = famMatch.primeTimeOnCourt + memberMatch.primeTimeOnCourt;
                }
            } else {
                const temp = {
                    familyId: oneMem['Family ID'],
                    familyName: oneMem['Family'],
                    familyMembers: 1
                }
                if (memberMatch) {
                    temp.hours = memberMatch.hoursOnCourt;
                    temp.primeTimeOnCourt = memberMatch.primeTimeOnCourt;
                } else {
                    temp.hours = 0;
                    temp.primeTimeOnCourt = 0;
                }
                famsArray.push(temp);
            }
        }
    });

    famsArray.sort((a, b) => b.hours - a.hours);
    res.status(200).json(famsArray)
})

router.get('/getMemberHours', async (req, res) => {
    console.log("CAM called getMemberHours");

    let reservationsQuery = {
        "Reservation Type": {
          $in: ["Singles", "Doubles", "Backboard (only court 8)", "Ball Machine"],
        },
        "Is Event?": false,
      }
    if (req.query.Year) {
        reservationsQuery["Start Date / Time"] = { $regex: req.query.Year }
    }

    // reservationsQuery["Created By"] = { $regex: "Chad McHardy" }

    var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

    let memberHours = []

    reservationsArray.forEach((oneRes) => {

        // Parse time of day out of date field
        const startRes = oneRes['Start Date / Time'];
        const endRes = oneRes['End Date / Time'];
        const [startDate, startTimeOfDay, startAmPm] = startRes.split(' ');
        const startTime = `${startTimeOfDay} ${startAmPm}`;
        const [endDate, endTimeOfDay, endAmPm] = endRes.split(' ');
        const endTime = `${endTimeOfDay} ${endAmPm}`;

        // Calculate time on court in hours for this reservation
        const timeOnCourt = getTimeOnCourt(startTime, endTime);
        const primeTimeOnCourt = getPrimeTimeOnCourt(startDate, startTime, endTime);

        // Members field contains comma-separated list of 
        // players in that reservation. Need to parse them out.
        // e.g. "Donna Lee Pon (#207216), Paulette Trudelle (#210277), Adriana Garcia (#209420), Sandra Harazny (#207532)"
        const members = oneRes.Members;

        // If no members associated with reservation, skip it
        if (!members) { return }

        let commaSplit = members.split(', ')

        // Assemble array showing hours on court for each member
        commaSplit.forEach((piece) => {
            let newPieces = piece.split(' (#')
            let memberName = newPieces[0];
            let memberId = newPieces[1].replace(')','');

            let memberMatch = memberHours.find(a => a.name === memberName);
            if (memberMatch) {
                memberMatch.count++;
                memberMatch.hoursOnCourt = memberMatch.hoursOnCourt + timeOnCourt;
                memberMatch.primeTimeOnCourt = memberMatch.primeTimeOnCourt + primeTimeOnCourt;
            } else {
                let toPush = {
                    name: memberName,
                    id: memberId,
                    count: 1,
                    hoursOnCourt: timeOnCourt,
                    primeTimeOnCourt: primeTimeOnCourt
                };
                memberHours.push(toPush)
            }
        })
    });

    memberHours.sort((a, b) => b.hoursOnCourt - a.hoursOnCourt);

    res.status(200).json(memberHours)
})


router.get('/getMembersRevenue', async (req, res) => {
    console.log("CAM called getMembersRevenue");

    // const year = req.query.Year;
    // const assignmentType = req.query.Type;

    // if (!year) {
    //     res.status(200).json({})
    //     return 
    // }

    let tempArray = [];

    let year = '2020'
    let reservationsQuery = {
        
        $or: [
            {"Start Date": {$gte: `${year}-01-01`, $lt: `${year}-10-01`}},
            {"End Date": {$gte: `${year}-12-31`, $lt: `${parseInt(year, 10) + 1}-04-02`}},
        ],

        // "Assignment Type": assignmentType,
        "Cancelled Date": "",  // ignore anything that was cancelled
      }

    var reservationsArray = await db.getDB().collection('memberships').aggregate( [
        {
          $match: reservationsQuery
        },
        {
          $group: {
            // _id: { "Membership Type": '$Assignment Type' },
            // _id: { "Membership Type": '$Membership Name' },
            _id: { "membershipType": '$Membership Name' },
            // memType: '$Membership Name',
            quantity: { $sum: 1 },
            revenue: { $sum: "$Amount" }
          },
        },
      ]).toArray();

      tempArray.push({
        year: year,
        results: reservationsArray
      })

    year = '2021'
    reservationsQuery = {
        
        $or: [
            {"Start Date": {$gte: `${year}-01-01`, $lt: `${year}-10-01`}},
            {"End Date": {$gte: `${year}-12-31`, $lt: `${parseInt(year, 10) + 1}-04-02`}},
        ],

        // "Assignment Type": assignmentType,
        "Cancelled Date": "",  // ignore anything that was cancelled
      }

    reservationsArray = await db.getDB().collection('memberships').aggregate( [
        {
          $match: reservationsQuery
        },
        {
          $group: {
            // _id: { "Membership Type": '$Assignment Type' },
            // _id: { "Membership Type": '$Membership Name' },
            _id: { "membershipType": '$Membership Name' },
            // memType: '$Membership Name',
            quantity: { $sum: 1 },
            revenue: { $sum: "$Amount" }
          },
        },
      ]).toArray();

      tempArray.push({
        year: year,
        results: reservationsArray
      })
    
    year = '2022'
    reservationsQuery = {
          
          $or: [
              {"Start Date": {$gte: `${year}-01-01`, $lt: `${year}-10-01`}},
              {"End Date": {$gte: `${year}-12-31`, $lt: `${parseInt(year, 10) + 1}-04-02`}},
          ],
  
          // "Assignment Type": assignmentType,
          "Cancelled Date": "",  // ignore anything that was cancelled
        }
  
    reservationsArray = await db.getDB().collection('memberships').aggregate( [
          {
            $match: reservationsQuery
          },
          {
            $group: {
              // _id: { "Membership Type": '$Assignment Type' },
              // _id: { "Membership Type": '$Membership Name' },
              _id: { "membershipType": '$Membership Name' },
              // memType: '$Membership Name',
              quantity: { $sum: 1 },
              revenue: { $sum: "$Amount" }
            },
          },
        ]).toArray();
  
    tempArray.push({
        year: year,
        results: reservationsArray
    })

    year = '2023'
    reservationsQuery = {
          
          $or: [
              {"Start Date": {$gte: `${year}-01-01`, $lt: `${year}-10-01`}},
              {"End Date": {$gte: `${year}-12-31`, $lt: `${parseInt(year, 10) + 1}-04-02`}},
          ],
  
          // "Assignment Type": assignmentType,
          "Cancelled Date": "",  // ignore anything that was cancelled
        }
  
    reservationsArray = await db.getDB().collection('memberships').aggregate( [
          {
            $match: reservationsQuery
          },
          {
            $group: {
              // _id: { "Membership Type": '$Assignment Type' },
              // _id: { "Membership Type": '$Membership Name' },
              _id: { "membershipType": '$Membership Name' },
              // memType: '$Membership Name',
              quantity: { $sum: 1 },
              revenue: { $sum: "$Amount" }
            },
          },
        ]).toArray();
  
    tempArray.push({
        year: year,
        results: reservationsArray
    })

    // db.inventory.distinct( "dept" )
    const memTypes = await db.getDB().collection('memberships').distinct( "Membership Name" )
    // console.log('CAM bonkers')
    // console.log(bonkers)


    // let stock = "Test"
    // const memTypes = [
    //     "Adult Membership",
    //     "Junior Membership (15 and under)",
    //     "Staff Membership",
    //     "Family Membership",
    //     "End of Season 'Stragglers'",
    //     "Smash Sponsorship",
    //     "Ace Sponsorship",
    //     "Full-Time Student Membership (Ages 16-17)",
    //     "Full-Time Student Membership (Ages 18-23)",
    //     "LTC Supporter"
    // ]

    const finalArray = tempArray.map((a) => {

        const quantities = {}
        const revenues = {}

        memTypes.forEach((memType) => {
            const thisOne = a.results.find(b => b._id.membershipType === memType)
            if (thisOne) {
                quantities[memType] = thisOne.quantity
                revenues[memType] = thisOne.revenue
            }
        })

        return {
            Year: a.year,
            Quantity: quantities,
            Revenue: revenues,
        }
    })

    res.status(200).json(finalArray)
})


// CAM TODO this one needs a loop
router.get('/getMembersBreakdown', async (req, res) => {

    let tempArray = [];
    let year = '2020'
    let reservationsQuery = {
        $or: [
            {"Start Date": {$gte: `${year}-01-01`, $lt: `${year}-10-01`}},
            {"End Date": {$gte: `${year}-12-31`, $lt: `${parseInt(year, 10) + 1}-04-02`}},
        ],
        "Cancelled Date": "",  // ignore anything that was cancelled
      }

    var reservationsArray = await db.getDB().collection('memberships').aggregate( [
        {
          $match: reservationsQuery
        },
        {
          $group: {
            _id: { "membershipType": '$Membership Name' },
            quantity: { $sum: 1 },
            revenue: { $sum: "$Amount" }
          },
        },
      ]).toArray();

      let newTempArray = []

      reservationsArray.forEach((a) => {
        if (a._id.membershipType.includes('Junior Membership')) {
            const tempMatch = newTempArray.find((b) => {
                return b._id.membershipType === 'Junior Membership'
            })
            if (tempMatch) {
                tempMatch.quantity += a.quantity
                tempMatch.revenue += a.revenue
            } else {
                newTempArray.push(
                    {
                        _id: { membershipType: 'Junior Membership' },
                        quantity: a.quantity,
                        revenue: a.revenue
                    }
                )
            }
        } else if (a._id.membershipType.includes('Instant Tennis')) {
            const tempMatch = newTempArray.find((b) => {
                return b._id.membershipType === 'Instant Tennis Graduate'
            })
            if (tempMatch) {
                tempMatch.quantity += a.quantity
                tempMatch.revenue += a.revenue
            } else {
                newTempArray.push(
                    {
                        _id: { membershipType: 'Instant Tennis Graduate' },
                        quantity: a.quantity,
                        revenue: a.revenue
                    }
                )
            }
        } else if (a._id.membershipType.includes('Student Membership')) {
            const tempMatch = newTempArray.find((b) => {
                return b._id.membershipType === 'Student Membership'
            })
            if (tempMatch) {
                tempMatch.quantity += a.quantity
                tempMatch.revenue += a.revenue
            } else {
                newTempArray.push(
                    {
                        _id: { membershipType: 'Student Membership' },
                        quantity: a.quantity,
                        revenue: a.revenue
                    }
                )
            }
        } else {
            newTempArray.push(a)
        }
      })

    tempArray.push({
        year: year,
        results: newTempArray
    })

    year = '2021'
    reservationsQuery = {
        $or: [
            {"Start Date": {$gte: `${year}-01-01`, $lt: `${year}-10-01`}},
            {"End Date": {$gte: `${year}-12-31`, $lt: `${parseInt(year, 10) + 1}-04-02`}},
        ],
        "Cancelled Date": "",  // ignore anything that was cancelled
      }

    reservationsArray = await db.getDB().collection('memberships').aggregate( [
        {
          $match: reservationsQuery
        },
        {
          $group: {
            _id: { "membershipType": '$Membership Name' },
            quantity: { $sum: 1 },
            revenue: { $sum: "$Amount" }
          },
        },
      ]).toArray();

      newTempArray = []

      reservationsArray.forEach((a) => {
        if (a._id.membershipType.includes('Junior Membership')) {
            const tempMatch = newTempArray.find((b) => {
                return b._id.membershipType === 'Junior Membership'
            })
            if (tempMatch) {
                tempMatch.quantity += a.quantity
                tempMatch.revenue += a.revenue
            } else {
                newTempArray.push(
                    {
                        _id: { membershipType: 'Junior Membership' },
                        quantity: a.quantity,
                        revenue: a.revenue
                    }
                )
            }
        } else if (a._id.membershipType.includes('Instant Tennis')) {
            const tempMatch = newTempArray.find((b) => {
                return b._id.membershipType === 'Instant Tennis Graduate'
            })
            if (tempMatch) {
                tempMatch.quantity += a.quantity
                tempMatch.revenue += a.revenue
            } else {
                newTempArray.push(
                    {
                        _id: { membershipType: 'Instant Tennis Graduate' },
                        quantity: a.quantity,
                        revenue: a.revenue
                    }
                )
            }
        } else if (a._id.membershipType.includes('Student Membership')) {
            const tempMatch = newTempArray.find((b) => {
                return b._id.membershipType === 'Student Membership'
            })
            if (tempMatch) {
                tempMatch.quantity += a.quantity
                tempMatch.revenue += a.revenue
            } else {
                newTempArray.push(
                    {
                        _id: { membershipType: 'Student Membership' },
                        quantity: a.quantity,
                        revenue: a.revenue
                    }
                )
            }
        } else {
            newTempArray.push(a)
        }
      })

    tempArray.push({
        year: year,
        results: newTempArray
    })
    
    year = '2022'
    reservationsQuery = {
          $or: [
              {"Start Date": {$gte: `${year}-01-01`, $lt: `${year}-10-01`}},
              {"End Date": {$gte: `${year}-12-31`, $lt: `${parseInt(year, 10) + 1}-04-02`}},
          ],
          "Cancelled Date": "",  // ignore anything that was cancelled
        }
  
    reservationsArray = await db.getDB().collection('memberships').aggregate( [
          {
            $match: reservationsQuery
          },
          {
            $group: {
              _id: { "membershipType": '$Membership Name' },
              quantity: { $sum: 1 },
              revenue: { $sum: "$Amount" }
            },
          },
        ]).toArray();
  

        newTempArray = []

        reservationsArray.forEach((a) => {
          if (a._id.membershipType.includes('Junior Membership')) {
              const tempMatch = newTempArray.find((b) => {
                  return b._id.membershipType === 'Junior Membership'
              })
              if (tempMatch) {
                  tempMatch.quantity += a.quantity
                  tempMatch.revenue += a.revenue
              } else {
                  newTempArray.push(
                      {
                          _id: { membershipType: 'Junior Membership' },
                          quantity: a.quantity,
                          revenue: a.revenue
                      }
                  )
              }
          } else if (a._id.membershipType.includes('Instant Tennis')) {
              const tempMatch = newTempArray.find((b) => {
                  return b._id.membershipType === 'Instant Tennis Graduate'
              })
              if (tempMatch) {
                  tempMatch.quantity += a.quantity
                  tempMatch.revenue += a.revenue
              } else {
                  newTempArray.push(
                      {
                          _id: { membershipType: 'Instant Tennis Graduate' },
                          quantity: a.quantity,
                          revenue: a.revenue
                      }
                  )
              }
          } else if (a._id.membershipType.includes('Student Membership')) {
              const tempMatch = newTempArray.find((b) => {
                  return b._id.membershipType === 'Student Membership'
              })
              if (tempMatch) {
                  tempMatch.quantity += a.quantity
                  tempMatch.revenue += a.revenue
              } else {
                  newTempArray.push(
                      {
                          _id: { membershipType: 'Student Membership' },
                          quantity: a.quantity,
                          revenue: a.revenue
                      }
                  )
              }
          } else {
              newTempArray.push(a)
          }
        })

    tempArray.push({
        year: year,
        results: newTempArray
    })

    year = '2023'
    reservationsQuery = {
          $or: [
              {"Start Date": {$gte: `${year}-01-01`, $lt: `${year}-10-01`}},
              {"End Date": {$gte: `${year}-12-31`, $lt: `${parseInt(year, 10) + 1}-04-02`}},
          ],
          "Cancelled Date": "",  // ignore anything that was cancelled
        }
  
    reservationsArray = await db.getDB().collection('memberships').aggregate( [
          {
            $match: reservationsQuery
          },
          {
            $group: {
              _id: { "membershipType": '$Membership Name' },
              quantity: { $sum: 1 },
              revenue: { $sum: "$Amount" }
            },
          },
        ]).toArray();
  
        newTempArray = []

        reservationsArray.forEach((a) => {
          if (a._id.membershipType.includes('Junior Membership')) {
              const tempMatch = newTempArray.find((b) => {
                  return b._id.membershipType === 'Junior Membership'
              })
              if (tempMatch) {
                  tempMatch.quantity += a.quantity
                  tempMatch.revenue += a.revenue
              } else {
                  newTempArray.push(
                      {
                          _id: { membershipType: 'Junior Membership' },
                          quantity: a.quantity,
                          revenue: a.revenue
                      }
                  )
              }
          } else if (a._id.membershipType.includes('Instant Tennis')) {
              const tempMatch = newTempArray.find((b) => {
                  return b._id.membershipType === 'Instant Tennis Graduate'
              })
              if (tempMatch) {
                  tempMatch.quantity += a.quantity
                  tempMatch.revenue += a.revenue
              } else {
                  newTempArray.push(
                      {
                          _id: { membershipType: 'Instant Tennis Graduate' },
                          quantity: a.quantity,
                          revenue: a.revenue
                      }
                  )
              }
          } else if (a._id.membershipType.includes('Student Membership')) {
              const tempMatch = newTempArray.find((b) => {
                  return b._id.membershipType === 'Student Membership'
              })
              if (tempMatch) {
                  tempMatch.quantity += a.quantity
                  tempMatch.revenue += a.revenue
              } else {
                  newTempArray.push(
                      {
                          _id: { membershipType: 'Student Membership' },
                          quantity: a.quantity,
                          revenue: a.revenue
                      }
                  )
              }
          } else {
              newTempArray.push(a)
          }
        })

    tempArray.push({
        year: year,
        results: newTempArray
    })

    year = '2024'
    reservationsQuery = {
          $or: [
              {"Start Date": {$gte: `${year}-01-01`, $lt: `${year}-10-01`}},
              {"End Date": {$gte: `${year}-12-31`, $lt: `${parseInt(year, 10) + 1}-04-02`}},
          ],
          "Cancelled Date": "",  // ignore anything that was cancelled
        }
  
    reservationsArray = await db.getDB().collection('memberships').aggregate( [
          {
            $match: reservationsQuery
          },
          {
            $group: {
              _id: { "membershipType": '$Membership Name' },
              quantity: { $sum: 1 },
              revenue: { $sum: "$Amount" }
            },
          },
        ]).toArray();
  
        newTempArray = []

        reservationsArray.forEach((a) => {
          if (a._id.membershipType.includes('Junior Membership')) {
              const tempMatch = newTempArray.find((b) => {
                  return b._id.membershipType === 'Junior Membership'
              })
              if (tempMatch) {
                  tempMatch.quantity += a.quantity
                  tempMatch.revenue += a.revenue
              } else {
                  newTempArray.push(
                      {
                          _id: { membershipType: 'Junior Membership' },
                          quantity: a.quantity,
                          revenue: a.revenue
                      }
                  )
              }
          } else if (a._id.membershipType.includes('Instant Tennis')) {
              const tempMatch = newTempArray.find((b) => {
                  return b._id.membershipType === 'Instant Tennis Graduate'
              })
              if (tempMatch) {
                  tempMatch.quantity += a.quantity
                  tempMatch.revenue += a.revenue
              } else {
                  newTempArray.push(
                      {
                          _id: { membershipType: 'Instant Tennis Graduate' },
                          quantity: a.quantity,
                          revenue: a.revenue
                      }
                  )
              }
          } else if (a._id.membershipType.includes('Student Membership')) {
              const tempMatch = newTempArray.find((b) => {
                  return b._id.membershipType === 'Student Membership'
              })
              if (tempMatch) {
                  tempMatch.quantity += a.quantity
                  tempMatch.revenue += a.revenue
              } else {
                  newTempArray.push(
                      {
                          _id: { membershipType: 'Student Membership' },
                          quantity: a.quantity,
                          revenue: a.revenue
                      }
                  )
              }
          } else {
              newTempArray.push(a)
          }
        })

    tempArray.push({
        year: year,
        results: newTempArray
    })

    const memTypes = [
        "Adult Membership",
        "Junior Membership",
        "Staff Membership",
        "Family Membership",
        "End of Season 'Stragglers'",
        "Smash Sponsorship",
        "Ace Sponsorship",
        "Student Membership",
        "Instant Tennis Graduate",
        "LTC Supporter"
    ]

    const finalArray = tempArray.map((a) => {

        const quantities = {}
        const revenues = {}

        memTypes.forEach((memType) => {
            const thisOne = a.results.find(b => b._id.membershipType === memType)
            if (thisOne) {
                quantities[memType] = thisOne.quantity
                revenues[memType] = thisOne.revenue
            }
        })

        return {
            Year: a.year,
            Quantity: quantities,
            Revenue: revenues,
        }
    })

    res.status(200).json(finalArray)
})


router.get('/getMembers', async (req, res) => {
    console.log("CAM called getMembers");

    const year = req.query.Year;
    const assignmentType = req.query.Type;

    if (!year) {
        res.status(200).json({})
        return 
    }

    // text = parseInt(text, 10) + 1;

    let reservationsQuery = {
        // "Reservation Type": {
        //   $in: ["Private Lesson"],
        // },
        // "Is Event?": false,
        // "End Date": {
        //     $in: ["2023-12-31", "2024-04-01"],
        // },
        
        $or: [
            {"Start Date": {$gte: `${year}-01-01`, $lt: `${year}-10-01`}},
            {"End Date": {$gte: `${year}-12-31`, $lt: `${parseInt(year, 10) + 1}-04-02`}},
        ],

        // $or: [
        //     {"Start Date": {$gte: "2023-01-01", $lt: "2023-10-01"}},
        //     {"End Date": {$gte: "2023-12-31", $lt: "2024-04-02"}},
        // ],

        // "Start Date": {$gte: "2022-01-01", $lt: "2022-11-01"},
        // "End Date": {$gte: "2023-12-31", $lt: "2024-04-02"},
        // "Member Name": "Valerie Hagen",
        // "Membership Name": "Family Membership"
        // "Membership Name": assignmentType


        // "Assignment Type": assignmentType,
        "Cancelled Date": "",
      }
    // if (req.query.Year) {
    //     reservationsQuery["Start Date / Time"] = { $regex: req.query.Year }
    // }

    var reservationsArray = await db.getDB().collection('memberships').find(reservationsQuery).toArray();


    let memberMatch = reservationsArray.find((a) => {
        // return a["Member Name"] === 'Chad McHardy'
        return a["Member Name"] === 'Craig Reed'
    })
    console.log(memberMatch)

    // let memberHours = []
    res.status(200).json(reservationsArray)
})

router.get('/getMemberLessonHours', async (req, res) => {
    console.log("CAM called getMemberLessonHours");

    let reservationsQuery = {
        "Reservation Type": {
          $in: ["Private Lesson"],
        },
        "Is Event?": false,
      }
    if (req.query.Year) {
        reservationsQuery["Start Date / Time"] = { $regex: req.query.Year }
    }

    var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

    let memberHours = []

    reservationsArray.forEach((oneRes) => {

        // Parse time of day out of date field
        const startRes = oneRes['Start Date / Time'];
        const endRes = oneRes['End Date / Time'];
        const [startDate, startTimeOfDay, startAmPm] = startRes.split(' ');
        const startTime = `${startTimeOfDay} ${startAmPm}`;
        const [endDate, endTimeOfDay, endAmPm] = endRes.split(' ');
        const endTime = `${endTimeOfDay} ${endAmPm}`;

        // Calculate time on court in hours for this reservation
        const timeOnCourt = getTimeOnCourt(startTime, endTime);
        const primeTimeOnCourt = getPrimeTimeOnCourt(startDate, startTime, endTime);

        // Members field contains comma-separated list of 
        // players in that reservation. Need to parse them out.
        // e.g. "Donna Lee Pon (#207216), Paulette Trudelle (#210277), Adriana Garcia (#209420), Sandra Harazny (#207532)"
        const members = oneRes.Members;

        // If no members associated with reservation, skip it
        if (!members) { return }

        let thisInstructor = getReservationInstructor(oneRes);

        let commaSplit = members.split(', ')

        // Assemble array showing hours on court for each member
        commaSplit.forEach((piece) => {
            let newPieces = piece.split(' (#')
            let memberName = newPieces[0];
            let memberId = newPieces[1].replace(')','');

            let memberMatch = memberHours.find(a => a.name === memberName);
            if (memberMatch) {
                memberMatch.count++;
                memberMatch.hoursOnCourt = memberMatch.hoursOnCourt + timeOnCourt;
                memberMatch.primeTimeOnCourt = memberMatch.primeTimeOnCourt + primeTimeOnCourt;
                const instructors = memberMatch.instructors;
                let instructorMatch = instructors.find(a => a.name === thisInstructor);
                if (instructorMatch) {
                    instructorMatch.hours = instructorMatch.hours + timeOnCourt;
                } else {
                    instructors.push({ name: thisInstructor, hours: timeOnCourt })
                }
            } else {
                let toPush = {
                    name: memberName,
                    id: memberId,
                    count: 1,
                    hoursOnCourt: timeOnCourt,
                    primeTimeOnCourt: primeTimeOnCourt,
                    instructors: [
                        { name: thisInstructor, hours: timeOnCourt }
                    ]
                };
                memberHours.push(toPush)
            }
        })
    });

    memberHours.sort((a, b) => b.hoursOnCourt - a.hoursOnCourt);

    res.status(200).json(memberHours)
})

router.get('/getInstructorHours', async (req, res) => {

    let reservationsQuery = {
        "Reservation Type": {
          $in: ["Private Lesson"],
        },
        "Is Event?": false,
      }
    if (req.query.Year) {
        reservationsQuery["Start Date / Time"] = { $regex: req.query.Year }
    }

    var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

    let memberHours = []

    reservationsArray.forEach((oneRes) => {

        // Parse time of day out of date field
        const startRes = oneRes['Start Date / Time'];
        const endRes = oneRes['End Date / Time'];
        const [startDate, startTimeOfDay, startAmPm] = startRes.split(' ');
        const startTime = `${startTimeOfDay} ${startAmPm}`;
        const [endDate, endTimeOfDay, endAmPm] = endRes.split(' ');
        const endTime = `${endTimeOfDay} ${endAmPm}`;

        // Calculate time on court in hours for this reservation
        const timeOnCourt = getTimeOnCourt(startTime, endTime);
        const primeTimeOnCourt = getPrimeTimeOnCourt(startDate, startTime, endTime);

        // Members field contains comma-separated list of 
        // players in that reservation. Need to parse them out.
        const instructors = getReservationInstructor(oneRes);

        // If no members associated with reservation, skip it
        if (!instructors) { return }

        let commaSplit = instructors.split(', ')

        // Assemble array showing hours on court for each member
        commaSplit.forEach((piece) => {
            let memberMatch = memberHours.find(a => a.name === piece);
            if (memberMatch) {
                memberMatch.count++;
                memberMatch.hoursOnCourt = memberMatch.hoursOnCourt + timeOnCourt;
                memberMatch.primeTimeOnCourt = memberMatch.primeTimeOnCourt + primeTimeOnCourt;
            } else {
                let toPush = {
                    name: piece,
                    count: 1,
                    hoursOnCourt: timeOnCourt,
                    primeTimeOnCourt: primeTimeOnCourt
                };
                memberHours.push(toPush)
            }
        });

    });

    memberHours.sort((a, b) => b.hoursOnCourt - a.hoursOnCourt);

    res.status(200).json(memberHours)
})

router.get('/getReservationsByType', async (req, res) => {
    console.log("CAM called getReservationsByType");
    var reservationsArray = await db.getDB().collection('reservations').find({"Reservation Type": req.query.Type, "Is Event?": false}).toArray();
    res.status(200).json(reservationsArray)
})

router.get('/getReservationTypeCourtTotals', async (req, res) => {

    let reservationsQuery = {
        "Reservation Type": {
          $in: ["Singles", "Doubles", "Backboard (only court 8)", "Ball Machine"],
        },
        "Is Event?": false,
      }
    if (req.query.Year) {
        reservationsQuery["Start Date / Time"] = { $regex: req.query.Year }
    }

    var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

    let courtTotals = [];

    reservationsArray.forEach((oneRes) => {

        let courtMatch = courtTotals.find(a => a.court === oneRes.Courts);
        if (courtMatch) {
            courtMatch.reservationsTotal++;
            if (courtMatch[oneRes["Reservation Type"]]) {
                courtMatch[oneRes["Reservation Type"]]++;
            } else {
                courtMatch[oneRes["Reservation Type"]] = 1;
            }
        } else {
            let toPush = {
                court: oneRes.Courts,
                reservationsTotal: 1,
            };
            toPush[oneRes["Reservation Type"]] = 1
            courtTotals.push(toPush)
        }

    });

    courtTotals.sort(function(a, b) {
        return a.court.localeCompare(b.court);
    });

    res.status(200).json(courtTotals)
})

router.get('/getLongestFamilyDay', async (req, res) => {

    // No name provided, no results
    if (!req.query.Name) {
        res.status(200).json({});
        return;
    }

    // Gather all members of this family and
    // assemble array of their IDs
    var membersArray = await db.getDB().collection('members').find({ "Family" : req.query.Name }).toArray();
    var memberIds = membersArray.map(a => a['Member #'])

    // Combine them into regex string so we can
    // query all reservations they are involved in.
    regex = memberIds.join("|");

    const matchQuery = {
        "Members": { $regex: regex },
        "Reservation Type": { $ne: "Private Lesson" }
    }

    // Limit results to specific year if provided
    if (req.query.Year) {
        matchQuery["Start Date / Time"] = { $regex: req.query.Year }
    }

    var reservationsArray = await db.getDB().collection('reservations').aggregate( [
        {
            $match: matchQuery
        },
        {
            $addFields: {
                dateOfBooking: {
                    $substr: ['$Start Date / Time', 0, 10]
                }
            }
        },
      ]).toArray();

    // No reservations meet these conditions, so no results
    if (!reservationsArray) {
        res.status(200).json({});
        return;
    }

    let courtTotals = [];
    reservationsArray.forEach((oneRes) => {

        // Parse time of day out of date field
        const startRes = oneRes['Start Date / Time'];
        const endRes = oneRes['End Date / Time'];
        const [startDate, startTimeOfDay, startAmPm] = startRes.split(' ');
        const startTime = `${startTimeOfDay} ${startAmPm}`;
        const [endDate, endTimeOfDay, endAmPm] = endRes.split(' ');
        const endTime = `${endTimeOfDay} ${endAmPm}`;

        // Calculate time on court in hours for this reservation
        const timeOnCourt = getTimeOnCourt(startTime, endTime);
        // const primeTimeOnCourt = getPrimeTimeOnCourt(startDate, startTime, endTime);

        const members = oneRes.Members;

        // If no members associated with reservation, skip it
        if (!members) { return }

        let commaSplit = members.split(', ')

        // Assemble array showing hours on court for each member
        commaSplit.forEach((piece) => {
            let newPieces = piece.split(' (#')
            let memberName = newPieces[0];
            let memberId = newPieces[1].replace(')','');

            // console.log(`${memberId}`)

            if (memberIds.includes(parseInt(memberId))) {
                // console.log(`${memberName} is in family Shmalenberg`)

                let courtMatch = courtTotals.find(a => a.day === oneRes.dateOfBooking);
                if (courtMatch) {
                    courtMatch.reservations++;
                    courtMatch.hours = courtMatch.hours + timeOnCourt;
                } else {
                    let toPush = {
                        day: oneRes.dateOfBooking,
                        reservations: 1,
                        hours: timeOnCourt
                    };
                    courtTotals.push(toPush)
                }
            }
        })
    });

    courtTotals.sort((a, b) => b.hours - a.hours);

    // console.log(courtTotals)

    // Return top result
    res.status(200).json(courtTotals[0])
})

router.get('/getAllMembers', async (req, res) => {

    var membersArray = await db.getDB().collection('members').find({}).toArray();

    res.status(200).json(membersArray)
})

router.get('/getMemberFavourites', async (req, res) => {

    let reservationsQuery = {
        "Members": { $regex: req.query.Name },
        "Reservation Type": {
          $in: ["Singles", "Doubles", "Backboard (only court 8)", "Ball Machine"],
        },
        "Is Event?": false,
      }
    // if (req.query.Year) {
    //     reservationsQuery["Start Date / Time"] = { $regex: req.query.Year }
    // }

    var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

    // If no reservations found for this member, reply with empty object
    if (reservationsArray.length === 0) {
        res.status(200).json({})
        return
    }

    let courtTotals = [];
    let typeTotals = [];
    let timeTotals = [];
    let memberHours = [];

    reservationsArray.forEach((oneRes) => {

        let courtMatch = courtTotals.find(a => a.court === oneRes.Courts);
        if (courtMatch) {
            courtMatch.reservationsTotal++;
        } else {
            let toPush = {
                court: oneRes.Courts,
                reservationsTotal: 1,
            };
            courtTotals.push(toPush)
        }

        let typeMatch = typeTotals.find(a => a.type === oneRes["Reservation Type"]);
        if (typeMatch) {
            typeMatch.reservationsTotal++;
        } else {
            let toPush = {
                type: oneRes["Reservation Type"],
                reservationsTotal: 1,
            };
            typeTotals.push(toPush)
        }

        const startRes = oneRes['Start Date / Time'];
        const [startDate, startTimeOfDay, startAmPm] = startRes.split(' ');
        const startTime = `${startTimeOfDay} ${startAmPm}`;
        let timeMatch = timeTotals.find(a => a.time === startTime);
        if (timeMatch) {
            timeMatch.reservationsTotal++;
        } else {
            let toPush = {
                time: startTime,
                reservationsTotal: 1,
            };
            timeTotals.push(toPush)
        }

        // Get favourite partner

        const members = oneRes.Members;

        // If no members associated with reservation, skip it
        if (members) {

            let commaSplit = members.split(', ')

            // Assemble array showing hours on court for each member
            commaSplit.forEach((piece) => {
                let newPieces = piece.split(' (#')
                let memberName = newPieces[0];
                let memberId = newPieces[1].replace(')','');

                if (memberName !== req.query.Name) {

                    // let memberMatch = memberHours.find(a => a.name === memberName);
                    let memberMatch = memberHours.find(a => a.id === memberId);
                    if (memberMatch) {
                        memberMatch.count++;
                        // memberMatch.hoursOnCourt = memberMatch.hoursOnCourt + timeOnCourt;
                        // memberMatch.primeTimeOnCourt = memberMatch.primeTimeOnCourt + primeTimeOnCourt;
                    } else {
                        let toPush = {
                            name: memberName,
                            id: memberId,
                            count: 1,
                            // hoursOnCourt: timeOnCourt,
                            // primeTimeOnCourt: primeTimeOnCourt
                        };
                        memberHours.push(toPush)
                    }
                }
            })
        }

    });

    const faveCourt = courtTotals.reduce(function(prev, current) {
        return (prev && prev.reservationsTotal > current.reservationsTotal) ? prev : current
    })

    const faveType = typeTotals.reduce(function(prev, current) {
        return (prev && prev.reservationsTotal > current.reservationsTotal) ? prev : current
    })

    const faveTime = timeTotals.reduce(function(prev, current) {
        return (prev && prev.reservationsTotal > current.reservationsTotal) ? prev : current
    })

    const favePartner = memberHours.reduce(function(prev, current) {
        return (prev && prev.count > current.count) ? prev : current
    })

    res.status(200).json({ court: faveCourt, type: faveType, time: faveTime, partner: favePartner })
})

router.get('/getReservationsByYearType', async (req, res) => {
    console.log("CAM called getReservationsByYearType");
    var reservationsArray = await db.getDB().collection('reservations').find({"Start Date / Time": {$regex: req.query.Year}, "Reservation Type": req.query.Type}).toArray();
    res.status(200).json(reservationsArray)
})

// router.get('/getSinglesReservations', async (req, res) => {
//     console.log("CAM called getSinglesReservations");
//     var allReservationsArray = await db.getDB().collection('reservations').find({"Reservation Type": "Singles"}).toArray();
//     res.status(200).json(allReservationsArray)
// })

router.get('/getDistinctTypes', async (req, res) => {
    console.log("CAM called getDistinctTypes");
    // var reservationsArray = await db.getDB().collection('reservations').distinct("Reservation Type", {"Is Event?": false});
    var reservationsArray = await db.getDB().collection('reservations').distinct("Reservation Type", {"Is Event?": true});
    res.status(200).json(reservationsArray)
});

module.exports = router
