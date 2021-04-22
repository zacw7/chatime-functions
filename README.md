# chatime-functions

Backend code of final project Chatime for CS5520

## Author
Wen, Zhi (wen.zhi@northeastern.edu)

## Function list

| Function             | Trigger          | Description                                                                                            |
|----------------------|------------------|--------------------------------------------------------------------------------------------------------|
| addUserRecord        | On User Creation | This function will be trigger on user creation to add a record in database to store extra information. |
| createDriftBottle    | Http Request     | Create a drift bottle.                                                                                 |
| dailyCheckIn         | Http Request     | Daily check in.                                                                                        |
| fetchDriftBottle     | Http Request     | Get a random drift bottle.                                                                             |
| getProfile           | Http Request     | Retrieve user's profile.                                                                               |
| getRoomInfo          | Http Request     | Get the chat room info with a given chat room ID.                                                      |
| getRoomList          | Http Request     | List all the chat rooms the current user's is in.                                                      |
| messageToCreator     | Http Request     | Request starting chat with a drift bottle creator.                                                     |
| sendMessage          | Http Request     | Send a chat message.                                                                                   |
| subscribeTopic       | Http Request     | Subscribe to topic to establish a chat.                                                                |
| throwBackDriftBottle | Http Request     | Throw the current drift bottle back and so it can be picked by someone else.                           |
| unsubscribeTopic     | Http Request     | Unsubscribe to topic.                                                                                  |
| updateProfile        | Http Request     | Update user's profile.  

## Deployment
See [Get started](https://firebase.google.com/docs/functions/get-started?authuser=0)