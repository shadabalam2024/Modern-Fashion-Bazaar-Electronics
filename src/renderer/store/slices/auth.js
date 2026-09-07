import { createSlice } from '@reduxjs/toolkit'

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    permissions: {}
  },
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload.user
      state.permissions = action.payload.permissions
    },
    logout: (state) => {
      state.user = null
      state.permissions = {}
    }
  }
})

export const { setUser, logout } = authSlice.actions
export default authSlice.reducer
