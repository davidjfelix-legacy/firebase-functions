const _ = require('lodash')
const functions = require('firebase-functions')
const admin = require('firebase-admin')
const PubSub = require('@google-cloud/pubsub')
const GCS = require('@google-cloud/storage')
const express = require('express')

// Initialize firebase admin using functions login
admin.initializeApp(functions.config().firebase)

exports.defaultGroupMemberPermissions = functions.database.ref('/groups/{groupId}/members/{memberId}')
  .onWrite(event => {
    console.log(event.data.key)
    event.data.adminRef.set(Object.assign(
      {
        hasAdminPermissions: false,
      },
      event.data.val()
    ))
  })


exports.roleAddNewPermission = functions.database.ref('/roles/{roleId}/permissions/{permission}')
  .onCreate(event => {
    const groupId = event.data.adminRef.parent.parent.child('group_id')
      .once('value')
      .then(snapshot => snapshot.val())
    const groupMembersRef = event.data.adminRef.root.child(`/groups/${groupId}/members`)
    const groupMembers = groupMembersRef
      .once('value')
      .then(snapshot => snapshot.val())

    Object.keys(groupMembers)
      .map(memberId => {
        groupMembers[memberId] = Object.assign(
          _.get(groupMembers, `${memberId}.${event.params.permission}`, {}),
          {
            [event.params.roleId]: true
          }
        )
      })
    return groupMembersRef.set(groupMembers)
  })

exports.roleGrantNewMemberPermissions = functions.database.ref('/roles/{roleId}/members/{memberId}')
  .onCreate(event => {
    const groupId = event.data.adminRef.parent.parent.child('group_id')
      .once('value')
      .then(snapshot => snapshot.val())
    const groupMemberRef = event.data.adminRef.root.child(`/groups/${groupId}/members/${event.params.memberId}`)
    const groupMember = groupMemberRef
      .once('value')
      .then(snapshot => snapshot.val())


    Object.keys(
      _.get(
        event.data.adminRef.root.child(`/roles/${event.params.roleId}`).val(),
        'permissions',
        {}
      )
    ).map((permission) => {
      groupMember[permission] = Object.assign(
        _.get(groupMember, permission, {}),
        {
          [event.params.roleId]: true
        }
      )
    })
    return groupMemberRef.set(groupMember)
  })

exports.roleRemovePermission = functions.database.ref('/roles/{roleId}/permissions/{permission}')
  .onDelete(event => {
    const groupId = event.data.adminRef.parent.parent.child('group_id')
      .once('value')
      .then(snapshot => snapshot.val())
    const groupMembersRef = event.data.adminRef.root.child(`/groups/${groupId}/members`)
    const groupMembers = groupMembersRef
      .once('value')
      .then(snapshot => snapshot.val())

    Object.keys(groupMembers)
      .map(memberId => {
        groupMembers[memberId] = _.omit(
          _.get(groupMembers, `${memberId}.${event.params.permission}`, {}),
          event.params.roleId
        )
      })
    return groupMembersRef.set(groupMembers)
  })

exports.roleRevokeDeletedMemberPermissions = functions.database.ref('/roles/{roleId}/members/{memberId}')
  .onDelete(event => {
    const groupId = event.data.adminRef.parent.parent.child('group_id')
      .once('value')
      .then(snapshot => snapshot.val())
    const groupMemberRef = event.data.adminRef.root.child(`/groups/${groupId}/members/${event.params.memberId}`)
    const groupMember = groupMemberRef
      .once('value')
      .then(snapshot => snapshot.val())

    Object.keys(
      _.get(
        event.data.adminRef.root.child(`/roles/${event.params.roleId}`).val(),
        'permissions',
        {}
      )
    ).map((permission) => {
      groupMember[permission] = _.omit(
        _.get(groupMember, permission, {}),
        event.params.roleId
      )
    })
    return groupMemberRef.set(groupMember)
  })

exports.rawVideoNotifier = functions.storage.object().onChange(event => {
  if (event.data.name.startsWith('raw-videos/')) {
    console.log('Raw video to be encoded')
    const pubSub = PubSub()
    console.log(pubSub)
    pubSub.topic('raw-videos')
      .get(
        {autoCreate: true},
        function (err, topic, apiResponse) {
          console.log(apiResponse)
          topic.publish(event.data, function (err, messageIds, apiResponse) {
            console.log(messageIds)
            console.log(apiResponse)
          })
        }
      )
  }
})

exports.videoNotifier = functions.storage.object().onChange(event => {
  if (event.data.name.startsWith('videos/')) {
    console.log('A video to be added')
  }
})


// A passthrough service to get files from google storage and serve them with CORS
const videos = express()
videos.get('/:videoId/:fileName', (req, resp) => {
  resp.header('Access-Control-Allow-Origin', '*')
  const gcs = GCS()
  const bucket = gcs.bucket('iotv-1e541.appspot.com')
  const fileName = `videos/${req.params.videoId}/${req.params.fileName}`
  const file = bucket.file(fileName)
  file.exists((err, exists) => {
    if (err === null) {
      if (exists) {
        resp.status(200)
        file.createReadStream().pipe(resp)
      } else {
        resp.status(404).send('Not Found')
      }
    } else {
      resp.status(500).send('Server Error')
    }
  })
})

// Default 404 handler to quickly end bad routes
videos.use((req, resp) => resp.sendStatus(404))

exports.videos = functions.https.onRequest(videos)