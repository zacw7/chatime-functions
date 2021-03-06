
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const candidates = new Map();
const topics = new Map();

db.settings({ignoreUndefinedProperties: true});

// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions

exports.messageToCreator = functions.https.onCall((data, context) => {
  const uid = context.auth.uid || null;
  const username = context.auth.token.name || null;
  const bottleId = data.bottleId;
  if (uid == null || bottleId == null) {
    return;
  }
  const path = "users/" + uid + "/bottles";
  return db.collection(path).doc(bottleId).get().then((doc) => {
    if (doc.exists) {
      const bottle = doc.data();
      return admin
          .auth()
          .getUser(bottle.creatorUid)
          .then((userRecord) => {
            return db.collection("rooms")
                .add({
                  topic: "#DEFAULT_TOPIC#",
                  members: [uid, bottle.creatorUid],
                  memberNames: [username, userRecord.displayName],
                  createdAt: admin.firestore.Timestamp.now(),
                })
                .then((doc) => {
                  db.collection(path)
                      .doc(bottleId)
                      .update({
                        roomId: doc.id,
                      });
                  return doc.id;
                });
          });
    }
  });
});

exports.dailyCheckIn = functions.https.onCall((data, context) => {
  const uid = context.auth.uid || null;
  if (uid == null) {
    return;
  }
  return db.collection("users")
      .doc(uid)
      .update({
        lastCheckInTime: admin.firestore.Timestamp.now(),
        points: admin.firestore.FieldValue.increment(10),
      });
});

exports.throwBackDriftBottle = functions.https.onCall((data, context) => {
  const uid = context.auth.uid || null;
  const bottleId = data.bottleId || null;
  if (uid == null || bottleId == null) {
    return;
  }

  const path = "users/" + uid + "/bottles";

  return db.collection(path).doc(bottleId).get().then((doc) => {
    if (doc.exists) {
      const bottle = doc.data();
      delete bottle.pickedAt;
      if (bottle.roomId) {
        delete bottle.roomId;
      }
      db.collection("bottles")
          .doc(bottleId)
          .set(bottle);
      return db.collection(path)
          .doc(bottleId)
          .delete();
    } else {
      functions.logger.warn("Bottle doesn't exist under user ", uid);
    }
  }).catch((error) => {
    functions.logger.error(error);
  });
});

exports.fetchDriftBottle = functions.https.onCall((data, context) => {
  const uid = context.auth.uid || null;
  if (uid == null) {
    return;
  }

  return db
      .collection("bottles")
      .where("creatorUid", "!=", uid)
      .limit(1)
      .get()
      .then((querySnapshot) => {
        if (querySnapshot.size == 0) {
          return;
        }
        let bottle;
        let bottleId;

        querySnapshot.forEach((doc) => {
          bottleId = doc.id;
          bottle = doc.data();
        });
        // delete
        return db
            .collection("bottles")
            .doc(bottleId)
            .delete()
            .then(() => {
              // add to user
              const path = "users/" + uid + "/bottles";
              bottle.pickedAt = admin.firestore.Timestamp.now();
              return db
                  .collection(path)
                  .doc(bottleId)
                  .set(bottle)
                  .then(() => {
                    bottle.id = bottleId;
                    return bottle;
                  });
            });
      });
});

exports.addUserRecord = functions.auth.user().onCreate((user) => {
  const record = {
    uid: user.uid,
    about: "",
    points: 0,
    rooms: [],
    createdAt: admin.firestore.Timestamp.now(),
  };
  // insert record to db
  db.collection("users").doc(record.uid).set(record);
});

exports.updateProfile = functions.https.onCall((data, context) => {
  const uid = context.auth.uid || null;
  const username = data.username || null;
  const about = data.about || null;

  if (uid == null) {
    return;
  }

  // update profile
  admin.auth().updateUser(uid, {
    displayName: username,
  });

  db.collection("users").doc(uid).update({about: about});

  db.collection("rooms")
      .where("members", "array-contains", uid)
      .get()
      .then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          const room = doc.data();
          let ruid;
          room.members.forEach((member) => {
            if (member !== uid) {
              ruid = member;
            }
          });
          admin.auth()
              .getUser(ruid)
              .then((userRecord) => {
                doc.ref.update({
                  memberNames: [username, userRecord.displayName],
                });
              });
        });
      });
});

exports.getProfile = functions.https.onCall((data, context) => {
  const uid = context.auth.uid || null;
  if (uid == null) {
    return;
  }
  const user = {uid: uid};
  return admin
      .auth()
      .getUser(uid)
      .then((userAuth) => {
        user.email = userAuth.email;
        user.displayName = userAuth.displayName;
        user.photoUrl = userAuth.photoURL;
        return db
            .collection("users")
            .doc(uid)
            .get()
            .then((doc) => {
              const userDb = doc.data();
              user.about = userDb.about;
              user.points = userDb.points;
              if (userDb.lastCheckInTime &&
                 admin.firestore.Timestamp.now() - userDb.lastCheckInTime <=
                 86400) {
                user.checkedIn = true;
              } else {
                user.checkedIn = false;
              }
              functions.logger.info("return user: ", user);
              return user;
            });
      });
});

exports.createDriftBottle = functions.https.onCall((data, context) => {
  const driftBottle = {};
  driftBottle.creatorUid = context.auth.uid || null;
  driftBottle.content = data.content || null;
  driftBottle.id = data.id || null;
  driftBottle.createdAt = admin.firestore.Timestamp.now();
  if (data.audioUrl) {
    driftBottle.audioUrl = data.audioUrl;
  }
  if (data.photoUrl) {
    driftBottle.photoUrl = data.photoUrl;
  }
  if (data.latitude && data.longitude) {
    driftBottle.latitude = data.latitude;
    driftBottle.longitude = data.longitude;
  }
  functions.logger.info("Creating Bottle: " + driftBottle, {
    structuredData: true,
  });
  if (driftBottle.creatorUid == null || driftBottle.content == null) {
    return;
  }
  return db.collection("users").doc(driftBottle.creatorUid).update({
    points: admin.firestore.FieldValue.increment(30),
  }).then(() => {
    return admin
        .auth()
        .getUser(driftBottle.creatorUid)
        .then((userAuth) => {
          driftBottle.creatorUsername = userAuth.displayName;
          if (driftBottle.id == null) {
            return db.collection("bottles").add(driftBottle);
          } else {
            return db.collection("bottles")
                .doc(driftBottle.id)
                .set(driftBottle);
          }
        });
  });
});

exports.sendMessage = functions.https.onCall((data, context) => {
  const from = context.auth.uid || null;
  const name = context.auth.token.name || null;
  const to = data.to || null;
  const roomId = data.roomId || null;
  const content = data.content;

  if (from == null || to == null || roomId == null) {
    return;
  }

  const path = "rooms/" + roomId + "/messages";
  functions.logger.info("Message Path:" + path, {structuredData: true});
  const ts = admin.firestore.Timestamp.now();
  return db
      .collection(path)
      .add({
        from: from,
        to: to,
        content: content,
        timestamp: ts,
      })
      .then(() => {
        db.collection("rooms").doc(roomId).update({
          lastMessageTime: ts,
        });
        // send notification
        const message = {
          notification: {
            title: name + " sent you a new message.",
            body: content,
          },
          android: {
            notification: {
              icon: "ic_baseline_notifications_24",
              color: "#3f72af",
            },
          },
          topic: to,
        };

        admin.messaging().send(message);
      });
});

exports.getRoomList = functions.https.onCall((data, context) => {
  const uid = context.auth.uid || null;
  if (uid == null) {
    return;
  }

  return admin
      .auth()
      .getUser(uid)
      .then((userRecord) => {
        const username = userRecord.displayName;
        return db
            .collection("rooms")
            .where("members", "array-contains", uid)
            .get()
            .then((querySnapshot) => {
              const rooms = [];
              querySnapshot.forEach((doc) => {
                const room = doc.data();
                room.id = doc.id;
                room.members.forEach((member) => {
                  if (member !== uid) {
                    room.recipientUid = member;
                  }
                });
                delete room.members;
                if (room.memberNames) {
                  room.memberNames.forEach((name) => {
                    if (username !== name) {
                      room.recipientUsername = name;
                    }
                  });
                  delete room.memberNames;
                }
                rooms.push(room);
              });
              functions.logger.info("RoomList: ", rooms);
              return rooms;
            });
      });
});

exports.getRoomInfo = functions.https.onCall((data, context) => {
  const uid = context.auth.uid || null;
  const roomId = data.roomId || null;
  if (uid == null || roomId == null) {
    return;
  }

  return db.collection("rooms").doc(roomId).get().then((doc) => {
    if (doc.exists) {
      const room = doc.data();
      room.id = doc.id;
      functions.logger.info("Get room: ", room);
      room.members.forEach((member) => {
        if (member != uid) {
          room.recipientUid = member;
        }
      });
      delete room.members;
      return admin
          .auth()
          .getUser(uid)
          .then((userRecord) => {
            const username = userRecord.displayName;
            room.memberNames.forEach((name) => {
              if (username !== name) {
                room.recipientUsername = name;
              }
            });
            delete room.memberNames;
            return room;
          });
    }
  });
});

exports.subscribeTopic = functions.https.onCall((data, context) => {
  // Topic passed from the client.
  const topic = data.topic || "#DEFAULT_TOPIC#";
  const name = context.auth.token.name || null;
  // Authentication / user information is automatically added to the request.
  const uid = context.auth.uid;

  functions.logger.info("uid: " + uid + " ---> " + topic);
  topics.set(uid, topic);
  if (
    !candidates.has(topic) ||
    candidates.get(topic).uid === uid ||
    candidates.get(topic).timestamp < admin.firestore.Timestamp.now() - 60
  ) {
    functions.logger.info("No one is waiting");
    candidates.set(topic, {
      uid: uid,
      timestamp: admin.firestore.Timestamp.now(),
    });
  } else {
    const ruid = candidates.get(topic).uid;
    functions.logger.info("Found someone: " + ruid);
    candidates.delete(topic);
    // create room
    return admin
        .auth()
        .getUser(ruid)
        .then((userRecord) => {
          db.collection("rooms")
              .add({
                topic: topic,
                members: [uid, ruid],
                memberNames: [name, userRecord.displayName],
                createdAt: admin.firestore.Timestamp.now(),
              })
              .then((docRef) => {
                const topicCondition =
              "'" + uid + "' in topics || '" + ruid + "' in topics";
                functions.logger.info("Room created: ",
                    docRef.id, topicCondition);
                admin.messaging().send({
                  data: {
                    roomId: docRef.id,
                  },
                  condition: topicCondition,
                });
              });
        });
  }
});

exports.unsubscribeTopic = functions.https.onCall((data, context) => {
  const uid = context.auth.uid;
  const topic = topics.get(uid);
  functions.logger.info("uid: " + uid + " -x-> " + topic);
  if (candidates.has(topic) && candidates.has(topic) === uid) {
    candidates.delete(topic);
  }
});
