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
            let memberId = newPieces[1].replace(')','');;

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

// router.get('/getMemberHours', async (req, res) => {
//     console.log("CAM called getMemberHours");

//     let reservationsQuery = {
//         "Reservation Type": {
//           $in: ["Singles", "Doubles"],
//         },
//         "Is Event?": false,
//       }
//     if (req.query.Year) {
//         reservationsQuery["Start Date / Time"] = { $regex: req.query.Year }
//     }

//     var reservationsArray = await db.getDB().collection('reservations').find(reservationsQuery).toArray();

//     let memberHours = []

//     reservationsArray.forEach((oneRes) => {

//         // Parse time of day out of date field
//         const startDate = oneRes['Start Date / Time'];
//         const endDate = oneRes['End Date / Time'];
//         const [delme1, startTimeOfDay, startAmPm] = startDate.split(' ');
//         const startTime = `${startTimeOfDay} ${startAmPm}`;
//         const [delme2, endTimeOfDay, endAmPm] = endDate.split(' ');
//         const endTime = `${endTimeOfDay} ${endAmPm}`;

//         // Calculate time on court in hours for this reservation
//         const timeOnCourt = ( new Date("1970-1-1 " + convertTime12to24(endTime)) - new Date("1970-1-1 " + convertTime12to24(startTime)) ) / 1000 / 60 / 60;

//         // Members field contains comma-separated list of 
//         // players in that reservation. Need to parse them out.
//         // e.g. "Donna Lee Pon (#207216), Paulette Trudelle (#210277), Adriana Garcia (#209420), Sandra Harazny (#207532)"
//         const members = oneRes.Members;

//         // If no members associated with reservation, skip it
//         if (!members) { return }

//         let commaSplit = members.split(', ')

//         // Assemble array showing hours on court for each member
//         commaSplit.forEach((piece) => {
//             let newPieces = piece.split(' (#')
//             let memberName = newPieces[0];
//             let memberId = newPieces[1].replace(')','');;

//             let memberMatch = memberHours.find(a => a.name === memberName);
//             if (memberMatch) {
//                 memberMatch.count++;
//                 memberMatch.hoursOnCourt = memberMatch.hoursOnCourt + timeOnCourt;
//             } else {
//                 let toPush = {
//                     name: memberName,
//                     id: memberId,
//                     count: 1,
//                     hoursOnCourt: timeOnCourt
//                 };
//                 memberHours.push(toPush)
//             }
//         })
//     });

//     memberHours.sort((a, b) => b.hoursOnCourt - a.hoursOnCourt);

//     res.status(200).json(memberHours)
// })

router.get('/getReservationsByType', async (req, res) => {
    console.log("CAM called getReservationsByType");
    // let queryType = req.query.Type;
    // var reservationsArray = await db.getDB().collection('reservations').find({"Reservation Type": req.query.Type}).toArray();
    var reservationsArray = await db.getDB().collection('reservations').find({"Reservation Type": req.query.Type, "Is Event?": false}).toArray();
    res.status(200).json(reservationsArray)
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
