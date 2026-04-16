//
//  PassengerClientApp.swift
//  PassengerClient
//
//  Created by zqh980802 on 4/13/26.
//

import SwiftUI

@main
struct PassengerApp: App {
    @StateObject private var appViewModel = AppViewModel(apiClient: BackendAPIClient())

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appViewModel)
                .task {
                    await appViewModel.bootstrap()
                }
        }
    }
}
