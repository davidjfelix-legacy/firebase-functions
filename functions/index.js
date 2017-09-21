const _ = require('lodash')
const flatten = require('flat')
const functions = require('firebase-functions')
const admin = require('firebase-admin')
const PubSub = require('@google-cloud/pubsub')
const GCS = require('@google-cloud/storage')
const express = require('express')

// Initialize firebase admin using functions login
admin.initializeApp(functions.config().firebase)


exports.roleAddNewPermission = functions.database.ref('/roles/{roleId}/permissions/{permission}')
  .onCreate(event => {
    return event.data.adminRef.parent.parent.child('group_id')
      .once('value')
      .then(snapshot => {
        const groupId = snapshot.val()
        const groupMembersRef = event.data.adminRef.root.child(`/groups/${groupId}/members`)
        return groupMembersRef
          .once('value')
          .then(snapshot => {
            const groupMembers = snapshot.val()
            return event.data.adminRef.parent.parent
              .once('value')
              .then(snapshot => {
                const roleMembers = Object.keys(_.get(snapshot.val(), 'members', {}))

                Object.keys(_.pick(groupMembers, roleMembers))
                  .map(memberId => {
                    _.set(groupMembers, `${memberId}.permissions.${event.params.permission}`, Object.assign(
                      _.get(groupMembers, `${memberId}.permissions.${event.params.permission}`, {}),
                      {
                        [event.params.roleId]: true
                      }
                    ))
                  })
                console.log(groupMembers)
                return groupMembersRef.set(groupMembers)
              })
          })
      })
  })

exports.roleGrantNewMemberPermissions = functions.database.ref('/roles/{roleId}/members/{memberId}')
  .onCreate(event => {
    return event.data.adminRef.parent.parent.child('group_id')
      .once('value')
      .then(groupIdSnapshot => {
        const groupId = groupIdSnapshot.val()
        const groupMemberRef = event.data.adminRef.root.child(`/groups/${groupId}/members/${event.params.memberId}`)
        return groupMemberRef
          .once('value')
          .then(groupMemberSnapshot => {
            const groupMember = _.isObject(groupMemberSnapshot.val()) ? groupMemberSnapshot.val() : {}
            console.log(groupMember)
            return event.data.adminRef.root.child(`/roles/${event.params.roleId}`)
              .once('value')
              .then(rolePermissionsSnapshot => {
                Object.keys(
                  _.get(
                    rolePermissionsSnapshot.val(),
                    'permissions',
                    {}
                  )
                ).map((permission) => {
                  _.set(groupMember, `permissions.${permission}`, Object.assign(
                    _.get(groupMember, `permissions.${permission}`, {}),
                    {
                      [event.params.roleId]: true
                    }
                  ))
                })
                console.log(groupMember)
                return groupMemberRef.set(groupMember)
              })
          })
      })
  })

exports.roleRemovePermission = functions.database.ref('/roles/{roleId}/permissions/{permission}')
  .onDelete(event => {
    return event.data.adminRef.parent.parent.child('group_id')
      .once('value')
      .then(snapshot => {
        const groupId = snapshot.val()
        const groupMembersRef = event.data.adminRef.root.child(`/groups/${groupId}/members`)
        return groupMembersRef
          .once('value')
          .then(snapshot => {
            const groupMembers = snapshot.val()

            Object.keys(groupMembers)
              .map(memberId => {
                _.set(groupMembers, `${memberId}.permissions.${event.params.permission}`, _.omit(
                  _.get(groupMembers, `${memberId}.permissions.${event.params.permission}`, {}),
                  [event.params.roleId]
                ))
              })
            console.log(groupMembers)
            return groupMembersRef.set(groupMembers)
          })
      })
  })

exports.roleRevokeDeletedMemberPermissions = functions.database.ref('/roles/{roleId}/members/{memberId}')
  .onDelete(event => {
    return event.data.adminRef.parent.parent.child('group_id')
      .once('value')
      .then(groupIdSnapshot => {
        const groupId = groupIdSnapshot.val()
        const groupMemberRef = event.data.adminRef.root.child(`/groups/${groupId}/members/${event.params.memberId}`)
        return groupMemberRef
          .once('value')
          .then(groupMemberSnapshot => {
            const groupMember = groupMemberSnapshot.val()
            return event.data.adminRef.root.child(`/roles/${event.params.roleId}`)
              .once('value')
              .then(rolePermissionsSnapshot => {
                Object.keys(
                  _.get(
                    rolePermissionsSnapshot.val(),
                    'permissions',
                    {}
                  )
                ).map((permission) => {
                  _.set(groupMember, `permissions.${permission}`, _.omit(
                    _.get(groupMember, `permissions.${permission}`, {}),
                    [event.params.roleId]
                  ))
                })
                console.log(groupMember)
                return _.isEqual(_.omitBy(flatten(groupMember), _.isEmpty), {}) ?
                  groupMemberRef.set(true) :
                  groupMemberRef.set(groupMember)
              })
          })
      })
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