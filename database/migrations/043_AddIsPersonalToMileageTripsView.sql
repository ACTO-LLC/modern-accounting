-- Migration 043: Add IsPersonal column to v_MileageTrips view
-- Fixes #391: /mileage 400 error because the view was missing IsPersonal
-- which the Mileage page filters on (business vs personal trips).

IF EXISTS (SELECT 1 FROM sys.views WHERE name = 'v_MileageTrips' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    EXEC('
    ALTER VIEW [dbo].[v_MileageTrips] AS
    SELECT
        mt.[Id],
        mt.[VehicleId],
        v.[Name] AS VehicleName,
        CONCAT(v.[Year], '' '', v.[Make], '' '', v.[Model]) AS VehicleDescription,
        mt.[TripDate],
        mt.[StartLocation],
        mt.[EndLocation],
        mt.[StartOdometer],
        mt.[EndOdometer],
        mt.[Distance],
        mt.[Purpose],
        mt.[Category],
        mt.[RatePerMile],
        mt.[DeductibleAmount],
        mt.[CustomerId],
        c.[Name] AS CustomerName,
        mt.[ProjectId],
        p.[Name] AS ProjectName,
        mt.[Notes],
        mt.[IsRoundTrip],
        mt.[Status],
        mt.[IsPersonal],
        mt.[CreatedBy],
        mt.[CreatedAt],
        mt.[UpdatedAt]
    FROM
        [dbo].[MileageTrips] mt
        LEFT JOIN [dbo].[Vehicles] v ON mt.[VehicleId] = v.[Id]
        LEFT JOIN [dbo].[Customers] c ON mt.[CustomerId] = c.[Id]
        LEFT JOIN [dbo].[Projects] p ON mt.[ProjectId] = p.[Id]
    ');
END
GO
