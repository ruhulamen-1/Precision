import { SalesPersonVisit, MaterialReceiveItem } from '../types';

export const initialSalesPersonVisits: SalesPersonVisit[] = [];

export const initialMaterialReceipts: MaterialReceiveItem[] = [
    { id: 1, mrf: 'MRF-RMC-01', projectName: 'Lake Lofts', supplierName: 'Mir Cement RMC', materialName: 'RMC C30', quantity: 20, unit: 'm³', vehicle: 'Mixer Truck', vehicleNumber: "DH-11-0011", receivedBy: 'Ruhul Amen', receivingDate: '2024-08-25', receivingTime: '11:00', entryDate: '2024-08-25T11:05:00Z' },
    { id: 2, mrf: 'MRF-RMC-02', projectName: 'Gladiolus', supplierName: 'Concord RMC', materialName: 'RMC C25', quantity: 15, unit: 'm³', vehicle: 'Mixer Truck', vehicleNumber: "CH-22-0022", receivedBy: 'Admin User', receivingDate: '2024-08-25', receivingTime: '14:30', entryDate: '2024-08-25T14:35:00Z' },
    { id: 3, mrf: 'MRF-STEEL-01', projectName: 'Platinum', supplierName: 'BSRM Steel', materialName: 'Rebar 16mm', quantity: 5, unit: 'Ton', vehicle: 'Truck', vehicleNumber: "DH-33-0033", receivedBy: 'Ruhul Amen', receivingDate: '2024-08-24', receivingTime: '10:00', entryDate: '2024-08-24T10:10:00Z' },
    { id: 4, mrf: 'MRF-RMC-03', projectName: 'Jardin Palacia', supplierName: 'Mir Cement RMC', materialName: 'RMC C30', quantity: 25, unit: 'm³', vehicle: 'Mixer Truck', vehicleNumber: "DH-44-0044", receivedBy: 'Admin User', receivingDate: '2024-08-23', receivingTime: '15:00', entryDate: '2024-08-23T15:05:00Z' },
    { id: 5, mrf: 'MRF-RMC-04', projectName: 'Lake Lofts', supplierName: 'Concord RMC', materialName: 'RMC C35', quantity: 18, unit: 'm³', vehicle: 'Mixer Truck', vehicleNumber: "DH-55-0055", receivedBy: 'Ruhul Amen', receivingDate: '2024-08-22', receivingTime: '09:30', entryDate: '2024-08-22T09:35:00Z' },
];
