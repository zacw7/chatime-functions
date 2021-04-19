
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const candidates = new Map();

db.settings({ignoreUndefinedProperties: true});

// Create and Deploy Your First Cloud Functions
// https://firebase.google.com/docs/functions/write-firebase-functions

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
    scores: 0,
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
              user.scores = userDb.scores;
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
    scores: admin.firestore.FieldValue.increment(30),
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
  const to = data.to || null;
  const roomId = data.roomId || null;
  const content = data.content;
  // Authentication / user information is automatically added to the request.
  // const uid = context.auth.uid;
  // const name = context.auth.token.name || null;
  // const picture = context.auth.token.picture || null;
  // const email = context.auth.token.email || null;

  if (from == null || to == null || roomId == null) {
    return;
  }

  const path = "rooms/" + roomId + "/messages";
  functions.logger.info("Message Path:" + path, {structuredData: true});
  return db
      .collection(path)
      .add({
        from: from,
        to: to,
        content: content,
        timestamp: admin.firestore.Timestamp.now(),
      })
      .then((res) => {
        functions.logger.info("Added message with ID: ", res.id);
      // TODO - send notification
      });
});

exports.subscribeTopic = functions.https.onCall((data, context) => {
  // Topic passed from the client.
  const topic = data.topic;
  // Authentication / user information is automatically added to the request.
  const uid = context.auth.uid;
  const name = context.auth.token.name || null;
  const picture = context.auth.token.picture || null;
  const email = context.auth.token.email || null;

  functions.logger.info("uid: " + uid + " ---> " + topic);

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
                members: [
                  {
                    uid: uid,
                    username: name,
                    email: email,
                    pictureUrl: picture,
                  },
                  {
                    uid: ruid,
                    username: userRecord.displayName,
                    email: userRecord.email,
                    pictureUrl: userRecord.photoURL,
                  },
                ],
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
  // Topic passed from the client.
  const topic = data.topic;
  // Authentication / user information is automatically added to the request.
  const uid = context.auth.uid;
  functions.logger.info("uid: " + uid + " -x-> " + topic);
  if (candidates.has(topic) && candidates.has(topic) === uid) {
    candidates.delete(topic);
  }
});
