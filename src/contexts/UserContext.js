import React from 'react';
import { USER_PROFILE_INIT } from '../constants/data';

export const UserContext = React.createContext({
  userProfile: USER_PROFILE_INIT,
  setUserProfile: () => {},
});
